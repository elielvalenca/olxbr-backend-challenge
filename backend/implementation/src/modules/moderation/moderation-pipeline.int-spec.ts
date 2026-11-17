import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { asc, eq } from 'drizzle-orm';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import {
  insertVersion,
  newListingId,
} from '../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/support/postgres.js';
import { validateEnv } from '../../shared/config/env.js';
import { DatabaseModule as AppDatabaseModule } from '../../shared/database/database.module.js';
import { redisConnection } from '../../shared/queue/redis-connection.js';
import { SYSTEM_ACTOR, sellerActor } from '../listings/domain/actor.js';
import {
  listingAuditEvents,
  listings,
} from '../listings/infrastructure/schema.js';
import { LISTING_REPOSITORY } from '../listings/application/listing-repository.js';
import type { ListingRepository } from '../listings/application/listing-repository.js';
import { MODERATION_QUEUE } from '../../shared/queue/queues.js';
import { reprocessFailedModerations } from './infrastructure/reprocess-failed.js';
import { ProjectionModule } from '../projection/projection.module.js';
import { DrizzleListingQueries } from '../listings/infrastructure/drizzle-listing-queries.js';
import { WorkerOutboxModule } from '../../shared/outbox/worker-outbox.module.js';
import { ModerationModule } from './moderation.module.js';

type Reply = {
  status: number;
  json?: unknown;
  headers?: Record<string, string>;
};

/** Fluxo completo: Postgres + Redis reais e um mock de moderação em memória. */
describe('pipeline de moderação', () => {
  let testDb: TestDatabase;
  let redis: StartedRedisContainer;
  let mock: Server;
  let app: TestingModule;
  let queue: Queue;
  let cacheRedis: Redis;
  let repository: ListingRepository;
  let reply: (calls: number) => Reply;
  let calls: number;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redis = await new RedisContainer('redis:8.8-alpine').start();
    mock = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        calls++;
        const { status, json, headers } = reply(calls);
        res.writeHead(status, {
          'content-type': 'application/json',
          ...headers,
        });
        res.end(JSON.stringify(json ?? {}));
      });
    });
    await new Promise<void>((resolve) => mock.listen(0, resolve));

    const env = validateEnv({
      DATABASE_URL: testDb.url,
      JWT_SECRET: 'x'.repeat(32),
      REDIS_URL: redis.getConnectionUrl(),
      MODERATION_API_URL: `http://localhost:${(mock.address() as AddressInfo).port}`,
      MODERATION_ATTEMPTS: '3',
      MODERATION_BACKOFF_MS: '50',
      MODERATION_BREAKER_MIN_CALLS: '1000',
      OUTBOX_POLL_INTERVAL_MS: '100',
    });
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          validate: () => env,
        }),
        AppDatabaseModule,
        WorkerOutboxModule,
        ModerationModule,
        ProjectionModule,
      ],
    }).compile();
    await app.init();
    repository = app.get(LISTING_REPOSITORY);
    queue = new Queue(MODERATION_QUEUE, {
      connection: redisConnection(env.REDIS_URL),
    });
    cacheRedis = new Redis(env.REDIS_URL);
  });

  afterAll(async () => {
    await cacheRedis.quit();
    await queue.close();
    await app.close();
    await redis.stop();
    mock.close();
    await testDb.stop();
  });

  beforeEach(() => {
    calls = 0;
  });

  /** Cria uma versão `draft` e a envia para revisão pelo fluxo real (grava no outbox). */
  async function submitNewListing(overrides = {}) {
    const listingId = newListingId();
    await insertVersion(testDb.db, { listingId, version: 1, ...overrides });
    await repository.submit({ listingId, version: 1 }, sellerActor('seller-1'));
    return { listingId, version: 1 };
  }

  const row = async (listingId: string) =>
    (
      await testDb.db
        .select()
        .from(listings)
        .where(eq(listings.listingId, listingId))
    )[0]!;

  const waitFor = async <T>(
    read: () => Promise<T>,
    done: (v: T) => boolean,
  ) => {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const value = await read();
      if (done(value) || Date.now() > deadline) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const settled = (listingId: string) =>
    waitFor(
      () => row(listingId),
      (r) => r.status !== 'in_review',
    );

  it('publica quando a moderação aprova', async () => {
    reply = () => ({ status: 200, json: { status: 'approved' } });
    const { listingId } = await submitNewListing({ status: 'draft' });

    const result = await settled(listingId);

    expect(result.status).toBe('published');
    expect(result.publishedAt).not.toBeNull();
  });

  it('publicar projeta o detalhe no Redis e arquivar o remove', async () => {
    reply = () => ({ status: 200, json: { status: 'approved' } });
    const { listingId } = await submitNewListing();
    const key = `listing:detail:${listingId}`;
    const projected = () => cacheRedis.get(key);

    expect((await settled(listingId)).status).toBe('published');
    const raw = await waitFor(projected, (v) => v !== null);

    const fromDb = await new DrizzleListingQueries(testDb.db).findPublished(
      listingId,
    );
    expect(JSON.parse(raw!)).toEqual(JSON.parse(JSON.stringify(fromDb)));

    await repository.archiveAll(listingId, sellerActor('seller-1'));
    expect(await waitFor(projected, (v) => v === null)).toBeNull();
  });

  it('rejeita com o motivo informado', async () => {
    reply = () => ({
      status: 200,
      json: {
        status: 'rejected',
        rejection_reason: 'contact_info_not_allowed',
      },
    });
    const { listingId } = await submitNewListing();

    const result = await settled(listingId);

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('contact_info_not_allowed');
  });

  it('repete após 500 e publica', async () => {
    reply = (n) =>
      n === 1 ? { status: 500 } : { status: 200, json: { status: 'approved' } };
    const { listingId } = await submitNewListing();

    expect((await settled(listingId)).status).toBe('published');
    expect(calls).toBe(2);
  });

  it('pausa no 429 e conclui sem gastar tentativa', async () => {
    reply = (n) =>
      n === 1
        ? { status: 429, headers: { 'retry-after': '1' } }
        : { status: 200, json: { status: 'approved' } };
    const { listingId } = await submitNewListing();

    expect((await settled(listingId)).status).toBe('published');
    expect(calls).toBe(2);
    expect(await queue.getFailedCount()).toBe(0);
  });

  describe('falhas definitivas', () => {
    afterEach(async () => {
      await queue.obliterate({ force: true });
    });

    const failures = (listingId: string) =>
      testDb.db
        .select()
        .from(listingAuditEvents)
        .where(eq(listingAuditEvents.listingId, listingId))
        .orderBy(asc(listingAuditEvents.id))
        .then((events) =>
          events.filter((e) => e.reason === 'moderation_failed'),
        );

    it('400 não repete: permanece em revisão, com falha auditada', async () => {
      reply = () => ({ status: 400, json: { error: 'validation_error' } });
      const { listingId } = await submitNewListing();

      const events = await waitFor(
        () => failures(listingId),
        (e) => e.length > 0,
      );

      expect(events).toHaveLength(1);
      expect((await row(listingId)).status).toBe('in_review');
      expect(calls).toBe(1);
      expect(await queue.getFailedCount()).toBe(1);
    });

    it('500 até esgotar as tentativas: permanece em revisão e reprocessa depois', async () => {
      reply = () => ({ status: 500 });
      const { listingId } = await submitNewListing();

      const events = await waitFor(
        () => failures(listingId),
        (e) => e.length > 0,
      );

      expect(events[0]).toMatchObject({
        actor: 'system',
        metadata: { attempts: 3 },
      });
      expect((await row(listingId)).status).toBe('in_review');
      expect(calls).toBe(3);

      // Serviço recuperado: o reprocessamento reenfileira e a versão publica.
      reply = () => ({ status: 200, json: { status: 'approved' } });
      expect(await reprocessFailedModerations(queue)).toBe(1);
      expect((await settled(listingId)).status).toBe('published');
    });

    it('reprocessar job de versão já resolvida não altera o anúncio', async () => {
      reply = () => ({ status: 400 });
      const { listingId, version } = await submitNewListing();
      await waitFor(
        () => failures(listingId),
        (e) => e.length > 0,
      );
      await repository.publishReplacing(
        { listingId, version },
        { actor: SYSTEM_ACTOR, expectedFrom: 'in_review' },
      );
      const callsBefore = calls;

      expect(await reprocessFailedModerations(queue)).toBe(1);
      await waitFor(
        () => queue.getFailedCount(),
        (n) => n === 0,
      );
      await new Promise((r) => setTimeout(r, 300));

      expect(calls).toBe(callsBefore);
      expect((await row(listingId)).status).toBe('published');
    });
  });
});
