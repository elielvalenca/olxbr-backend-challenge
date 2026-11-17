import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import {
  insertImages,
  insertVersion,
  newListingId,
} from '../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/support/postgres.js';
import { DrizzleListingQueries } from '../listings/infrastructure/drizzle-listing-queries.js';
import { redisConnection } from '../../shared/queue/redis-connection.js';
import { PROJECTION_QUEUE } from '../../shared/queue/queues.js';
import { GetPublicListing } from '../listings/application/get-public-listing.js';
import { listings } from '../listings/infrastructure/schema.js';
import { ProjectListing } from './application/project-listing.js';
import { BullmqRebuildRequester } from './infrastructure/bullmq-rebuild-requester.js';
import { RedisPublicDetailCache } from './infrastructure/redis-public-detail-cache.js';

/** Postgres e Redis reais: o worker projeta o estado do banco e a leitura devolve o mesmo detalhe. */
describe('projeção do detalhe público', () => {
  let testDb: TestDatabase;
  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let queries: DrizzleListingQueries;
  let cache: RedisPublicDetailCache;
  let project: ProjectListing;
  const TTL = 600;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redisContainer = await new RedisContainer('redis:8.8-alpine').start();
    redis = new Redis(redisContainer.getConnectionUrl());
    queries = new DrizzleListingQueries(testDb.db);
    cache = new RedisPublicDetailCache(redis, TTL);
    project = new ProjectListing(queries, cache);
  });

  afterAll(async () => {
    await redis.quit();
    await redisContainer.stop();
    await testDb.stop();
  });

  const publish = async (version = 1) => {
    const listingId = newListingId();
    await insertVersion(testDb.db, {
      listingId,
      version,
      status: 'published',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await insertImages(testDb.db, listingId, version, [1, 0]);
    return listingId;
  };

  it('projeta o mesmo detalhe que o banco devolve, com validade', async () => {
    const listingId = await publish();

    await project.execute(listingId);

    const fromDb = await queries.findPublished(listingId);
    expect(await cache.get(listingId)).toEqual(fromDb);
    const ttl = await redis.ttl(`listing:detail:${listingId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL);
  });

  it('miss devolve null', async () => {
    expect(await cache.get(newListingId())).toBeNull();
  });

  it('nova versão publicada substitui a projeção', async () => {
    const listingId = await publish();
    await project.execute(listingId);
    await testDb.db
      .update(listings)
      .set({ status: 'archived' })
      .where(eq(listings.listingId, listingId));
    await insertVersion(testDb.db, {
      listingId,
      version: 2,
      status: 'published',
      title: 'Título da versão dois publicada',
      publishedAt: new Date(),
    });
    await insertImages(testDb.db, listingId, 2, [0]);

    await project.execute(listingId);

    expect(await cache.get(listingId)).toMatchObject({
      version: 2,
      title: 'Título da versão dois publicada',
    });
  });

  it('arquivar remove a projeção', async () => {
    const listingId = await publish();
    await project.execute(listingId);
    await testDb.db
      .update(listings)
      .set({ status: 'archived' })
      .where(eq(listings.listingId, listingId));

    await project.execute(listingId);

    expect(await cache.get(listingId)).toBeNull();
  });

  it('reprocessar a mesma mensagem não muda o resultado', async () => {
    const listingId = await publish();

    await project.execute(listingId);
    const first = await cache.get(listingId);
    await project.execute(listingId);

    expect(await cache.get(listingId)).toEqual(first);
  });

  it('Redis fora do ar: get falha na hora em vez de enfileirar comandos', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 200,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);

    await expect(
      new RedisPublicDetailCache(down, TTL).get(newListingId()),
    ).rejects.toThrow();
    down.disconnect();
  });

  it('Redis fora do ar: o detalhe público sai do banco, sem erro', async () => {
    const listingId = await publish();
    const down = new Redis('redis://127.0.0.1:1', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 200,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);
    const rebuild = { request: () => Promise.reject(new Error('fila fora')) };
    const useCase = new GetPublicListing(
      queries,
      new RedisPublicDetailCache(down, TTL),
      rebuild,
    );

    expect(await useCase.execute(listingId)).toEqual(
      await queries.findPublished(listingId),
    );
    down.disconnect();
  });

  it('vários pedidos de reconstrução do mesmo anúncio deixam um job pendente', async () => {
    const queue = new Queue(PROJECTION_QUEUE, {
      connection: redisConnection(redisContainer.getConnectionUrl()),
    });
    const requester = new BullmqRebuildRequester(queue);
    const listingId = newListingId();

    await Promise.all([
      requester.request(listingId),
      requester.request(listingId),
      requester.request(listingId),
    ]);
    await requester.request(newListingId());

    expect(await queue.getJobCounts('waiting')).toEqual({ waiting: 2 });
    await queue.close();
  });
});
