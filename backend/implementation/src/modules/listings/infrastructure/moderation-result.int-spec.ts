import { and, asc, eq } from 'drizzle-orm';
import {
  insertVersion,
  newListingId,
} from '../../../../test/support/listing-fixtures.js';
import { createTestOutbox } from '../../../../test/support/outbox.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { SYSTEM_ACTOR } from '../domain/actor.js';
import { ListingVersionConflictError } from '../domain/listing-errors.js';
import { DrizzleListingRepository } from './drizzle-listing-repository.js';
import { listingAuditEvents, listings } from './schema.js';

describe('resultado da moderação no repositório', () => {
  let testDb: TestDatabase;
  let testOutbox: Awaited<ReturnType<typeof createTestOutbox>>;
  let repository: DrizzleListingRepository;
  const db = () => testDb.db;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    testOutbox = await createTestOutbox(testDb.db);
    repository = new DrizzleListingRepository(testDb.db, testOutbox.outbox);
  });

  afterAll(async () => {
    await testOutbox.close();
    await testDb.stop();
  });

  const statuses = async (listingId: string) =>
    Object.fromEntries(
      (
        await db()
          .select({ version: listings.version, status: listings.status })
          .from(listings)
          .where(eq(listings.listingId, listingId))
      ).map((r) => [r.version, r.status]),
    );

  const events = (listingId: string) =>
    db()
      .select()
      .from(listingAuditEvents)
      .where(eq(listingAuditEvents.listingId, listingId))
      .orderBy(asc(listingAuditEvents.id));

  it('findVersion lê a versão pedida, não a mais recente', async () => {
    const listingId = newListingId();
    await insertVersion(db(), { listingId, version: 1, status: 'published' });
    await insertVersion(db(), { listingId, version: 2, status: 'draft' });

    const found = await repository.findVersion({ listingId, version: 1 });

    expect(found?.status).toBe('published');
    expect(await repository.findVersion({ listingId, version: 9 })).toBeNull();
  });

  it('publica a versão em revisão arquivando a publicada anterior', async () => {
    const listingId = newListingId();
    await insertVersion(db(), { listingId, version: 1, status: 'published' });
    await insertVersion(db(), { listingId, version: 2, status: 'in_review' });

    await repository.publishReplacing(
      { listingId, version: 2 },
      { actor: SYSTEM_ACTOR, expectedFrom: 'in_review' },
    );

    expect(await statuses(listingId)).toEqual({
      1: 'archived',
      2: 'published',
    });
  });

  it('rejeita com o motivo na versão e na auditoria', async () => {
    const listingId = newListingId();
    await insertVersion(db(), { listingId, version: 1, status: 'in_review' });

    await repository.transition({ listingId, version: 1 }, 'rejected', {
      actor: SYSTEM_ACTOR,
      reason: 'price_out_of_range',
      expectedFrom: 'in_review',
    });

    const [row] = await db()
      .select({ reason: listings.rejectionReason })
      .from(listings)
      .where(and(eq(listings.listingId, listingId), eq(listings.version, 1)));
    expect(row?.reason).toBe('price_out_of_range');
    expect((await events(listingId)).at(-1)).toMatchObject({
      fromStatus: 'in_review',
      toStatus: 'rejected',
      reason: 'price_out_of_range',
    });
  });

  it('conflito de status desfaz tudo, inclusive o arquivamento da anterior', async () => {
    const listingId = newListingId();
    await insertVersion(db(), { listingId, version: 1, status: 'published' });
    await insertVersion(db(), { listingId, version: 2, status: 'rejected' });

    await expect(
      repository.publishReplacing(
        { listingId, version: 2 },
        { actor: SYSTEM_ACTOR, expectedFrom: 'in_review' },
      ),
    ).rejects.toBeInstanceOf(ListingVersionConflictError);

    expect(await statuses(listingId)).toEqual({
      1: 'published',
      2: 'rejected',
    });
    expect(await events(listingId)).toHaveLength(0);
  });

  it('registra falha de moderação sem mudar o status', async () => {
    const listingId = newListingId();
    await insertVersion(db(), { listingId, version: 1, status: 'in_review' });

    await repository.recordModerationFailure(
      { listingId, version: 1 },
      { error: 'HTTP 500', attempts: 5 },
    );

    expect(await statuses(listingId)).toEqual({ 1: 'in_review' });
    expect(await events(listingId)).toMatchObject([
      {
        fromStatus: 'in_review',
        toStatus: 'in_review',
        actor: 'system',
        reason: 'moderation_failed',
        metadata: { error: 'HTTP 500', attempts: 5 },
      },
    ]);
  });
});
