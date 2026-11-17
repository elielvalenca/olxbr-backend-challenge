import { and, asc, eq } from 'drizzle-orm';
import { aContent } from '../../../../test/support/listing-content.js';
import {
  newListingId,
  insertVersion,
  PG,
  pgErrorCode,
} from '../../../../test/support/listing-fixtures.js';
import { createTestOutbox } from '../../../../test/support/outbox.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { SYSTEM_ACTOR, sellerActor } from '../domain/actor.js';
import { ListingVersionNotFoundError } from '../domain/listing-errors.js';
import { DrizzleListingRepository } from './drizzle-listing-repository.js';
import { listingAuditEvents, listings } from './schema.js';

describe('listing-audit', () => {
  let testDb: TestDatabase;
  let repository: DrizzleListingRepository;
  let testOutbox: Awaited<ReturnType<typeof createTestOutbox>>;
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

  const eventsOf = (listingId: string) =>
    db()
      .select()
      .from(listingAuditEvents)
      .where(eq(listingAuditEvents.listingId, listingId))
      .orderBy(asc(listingAuditEvents.id));

  const statusOf = async (listingId: string, version = 1) =>
    (
      await db()
        .select({ status: listings.status })
        .from(listings)
        .where(
          and(eq(listings.listingId, listingId), eq(listings.version, version)),
        )
    )[0]?.status;

  it('registra a criação do rascunho sem status de origem e com o vendedor como ator', async () => {
    const ref = await repository.createFirstVersion({
      sellerId: 'seller-42',
      content: aContent(),
      actor: sellerActor('seller-42'),
    });

    const [event] = await eventsOf(ref.listingId);

    expect(event).toMatchObject({
      version: 1,
      fromStatus: null,
      toStatus: 'draft',
      actor: 'seller-42',
      reason: null,
      metadata: null,
    });
  });

  it('registra a reprovação com origem, destino, motivo e o sistema como ator', async () => {
    const id = newListingId();
    await insertVersion(db(), {
      listingId: id,
      version: 1,
      status: 'in_review',
    });

    await repository.transition({ listingId: id, version: 1 }, 'rejected', {
      actor: SYSTEM_ACTOR,
      reason: 'price_out_of_range',
    });

    const [event] = await eventsOf(id);
    expect(event).toMatchObject({
      fromStatus: 'in_review',
      toStatus: 'rejected',
      actor: 'system',
      reason: 'price_out_of_range',
    });
    const [row] = await db()
      .select({ reason: listings.rejectionReason })
      .from(listings)
      .where(eq(listings.listingId, id));
    expect(row?.reason).toBe('price_out_of_range');
  });

  it('mantém um evento por transição, em ordem cronológica', async () => {
    const seller = sellerActor('seller-1');
    const ref = await repository.createFirstVersion({
      sellerId: 'seller-1',
      content: aContent(),
      actor: seller,
    });

    await repository.transition(ref, 'in_review', { actor: seller });
    await repository.publishReplacing(ref, { actor: SYSTEM_ACTOR });

    const events = await eventsOf(ref.listingId);
    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      [null, 'draft', 'seller-1'],
      ['draft', 'in_review', 'seller-1'],
      ['in_review', 'published', 'system'],
    ]);
    const times = events.map((e) => e.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('grava metadados estruturados quando informados e aceita a ausência deles', async () => {
    const id = newListingId();
    await insertVersion(db(), {
      listingId: id,
      version: 1,
      status: 'in_review',
    });

    await repository.transition({ listingId: id, version: 1 }, 'rejected', {
      actor: SYSTEM_ACTOR,
      metadata: { moderationRequestId: 'req-1', attempts: 2 },
    });

    const [event] = await eventsOf(id);
    expect(event?.metadata).toEqual({
      moderationRequestId: 'req-1',
      attempts: 2,
    });
  });

  describe('atomicidade com a transição', () => {
    it('não deixa evento quando a mudança de status falha', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'in_review',
      });

      const code = await pgErrorCode(
        repository.transition(
          { listingId: id, version: 1 },
          'pending' as never,
          {
            actor: SYSTEM_ACTOR,
          },
        ),
      );

      expect(code).toBe(PG.checkViolation);
      expect(await eventsOf(id)).toHaveLength(0);
      expect(await statusOf(id)).toBe('in_review');
    });

    it('não persiste o novo status quando a gravação do evento falha', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'in_review',
      });

      await expect(
        repository.transition({ listingId: id, version: 1 }, 'rejected', {
          actor: SYSTEM_ACTOR,
          // BigInt não serializa em JSON: a falha acontece depois do UPDATE
          metadata: { impossible: 1n },
        }),
      ).rejects.toThrow();

      expect(await statusOf(id)).toBe('in_review');
      expect(await eventsOf(id)).toHaveLength(0);
    });
  });

  it('rejeita evento de uma versão que não existe', async () => {
    const code = await pgErrorCode(
      db().insert(listingAuditEvents).values({
        listingId: newListingId(),
        version: 1,
        toStatus: 'draft',
        actor: 'system',
      }),
    );

    expect(code).toBe(PG.foreignKeyViolation);
  });

  it('falha de forma explícita ao mudar o status de uma versão inexistente', async () => {
    await expect(
      repository.transition(
        { listingId: newListingId(), version: 1 },
        'published',
        {
          actor: SYSTEM_ACTOR,
        },
      ),
    ).rejects.toBeInstanceOf(ListingVersionNotFoundError);
  });
});
