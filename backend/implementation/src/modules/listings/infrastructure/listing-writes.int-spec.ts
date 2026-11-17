import { asc, eq, sql } from 'drizzle-orm';
import { aContent } from '../../../../test/support/listing-content.js';
import {
  insertImages,
  insertVersion,
  newListingId,
} from '../../../../test/support/listing-fixtures.js';
import { createTestOutbox } from '../../../../test/support/outbox.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { sellerActor } from '../domain/actor.js';
import { ListingVersionConflictError } from '../domain/listing-errors.js';
import { DrizzleListingRepository } from './drizzle-listing-repository.js';
import { listingAuditEvents, listings } from './schema.js';

describe('escritas do ciclo de vida (DrizzleListingRepository)', () => {
  let testDb: TestDatabase;
  let testOutbox: Awaited<ReturnType<typeof createTestOutbox>>;
  let repository: DrizzleListingRepository;
  const db = () => testDb.db;
  const seller = sellerActor('seller-1');

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

  const outboxMessages = async (listingId: string) =>
    (
      await db().execute(
        sql`SELECT topic, payload FROM nest_outbox.messages
            WHERE payload->>'listingId' = ${listingId}`,
      )
    ).rows;

  describe('findLatest', () => {
    it('devolve a maior versão com conteúdo e imagens em ordem', async () => {
      const content = aContent();
      const { listingId } = await repository.createFirstVersion({
        sellerId: 'seller-1',
        content,
        actor: seller,
      });
      await db()
        .update(listings)
        .set({ status: 'rejected' })
        .where(eq(listings.listingId, listingId));
      await repository.createNextVersion({ listingId, version: 1 }, seller);

      const latest = await repository.findLatest(listingId);

      expect(latest).toEqual({
        ref: { listingId, version: 2 },
        sellerId: 'seller-1',
        status: 'draft',
        content,
      });
    });

    it('devolve null para anúncio inexistente', async () => {
      expect(await repository.findLatest(newListingId())).toBeNull();
    });
  });

  describe('submit', () => {
    it('grava status, auditoria e mensagem do outbox', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });

      await repository.submit({ listingId: id, version: 1 }, seller);

      expect(await statuses(id)).toEqual({ 1: 'in_review' });
      expect(
        (await events(id)).map((e) => [e.fromStatus, e.toStatus, e.actor]),
      ).toEqual([['draft', 'in_review', 'seller-1']]);
      expect(await outboxMessages(id)).toEqual([
        {
          topic: 'listing.submitted',
          payload: { listingId: id, version: 1 },
        },
      ]);
    });

    it('reverte tudo se a mensagem do outbox falhar', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });
      const failing = new DrizzleListingRepository(testDb.db, {
        add: () => Promise.reject(new Error('outbox fora do ar')),
      } as never);

      await expect(
        failing.submit({ listingId: id, version: 1 }, seller),
      ).rejects.toThrow('outbox fora do ar');

      expect(await statuses(id)).toEqual({ 1: 'draft' });
      expect(await events(id)).toEqual([]);
      expect(await outboxMessages(id)).toEqual([]);
    });

    it('recusa com conflito se a versão não está mais em draft', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'in_review',
      });

      await expect(
        repository.submit({ listingId: id, version: 1 }, seller),
      ).rejects.toBeInstanceOf(ListingVersionConflictError);
      expect(await outboxMessages(id)).toEqual([]);
    });
  });

  describe('updateDraft', () => {
    it('troca conteúdo e imagens sem criar versão nem evento', async () => {
      const { listingId } = await repository.createFirstVersion({
        sellerId: 'seller-1',
        content: aContent(),
        actor: seller,
      });
      const changed = aContent({
        title: 'Bicicleta aro 29 revisada',
        priceCents: 99_000,
        imageUrls: ['https://cdn.example.com/nova.jpg'],
      });

      await repository.updateDraft({ listingId, version: 1 }, changed);

      expect((await repository.findLatest(listingId))?.content).toEqual(
        changed,
      );
      expect(await statuses(listingId)).toEqual({ 1: 'draft' });
      expect(await events(listingId)).toHaveLength(1);
    });

    it('recusa versão que não é mais draft', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });

      await expect(
        repository.updateDraft({ listingId: id, version: 1 }, aContent()),
      ).rejects.toBeInstanceOf(ListingVersionConflictError);
    });
  });

  describe('createNextVersion com conteúdo', () => {
    it('sobrepõe a cópia e preserva a versão original', async () => {
      const original = aContent();
      const { listingId } = await repository.createFirstVersion({
        sellerId: 'seller-1',
        content: original,
        actor: seller,
      });
      await db()
        .update(listings)
        .set({ status: 'published' })
        .where(eq(listings.listingId, listingId));
      const changed = aContent({
        priceCents: 80_000,
        imageUrls: ['https://cdn.example.com/x.jpg'],
      });

      const next = await repository.createNextVersion(
        { listingId, version: 1 },
        seller,
        changed,
      );

      expect(next.version).toBe(2);
      expect(await statuses(listingId)).toEqual({ 1: 'published', 2: 'draft' });
      expect((await repository.findLatest(listingId))?.content).toEqual(
        changed,
      );
      const [v1] = await db()
        .select()
        .from(listings)
        .where(eq(listings.version, 1));
      expect(v1?.priceCents).toBe(original.priceCents);
    });
  });

  describe('archiveAll', () => {
    it('arquiva published e draft, com um evento por versão', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });
      await insertVersion(db(), { listingId: id, version: 2, status: 'draft' });
      await insertImages(db(), id, 1, [0]);

      await repository.archiveAll(id, seller);

      expect(await statuses(id)).toEqual({ 1: 'archived', 2: 'archived' });
      expect(
        (await events(id)).map((e) => [
          e.version,
          e.fromStatus,
          e.toStatus,
          e.actor,
        ]),
      ).toEqual([
        [1, 'published', 'archived', 'seller-1'],
        [2, 'draft', 'archived', 'seller-1'],
      ]);
      expect(await outboxMessages(id)).toEqual([
        { topic: 'listing.archived', payload: { listingId: id } },
      ]);
    });

    it('recusa, sem alterar nada, se houver versão em revisão', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });
      await insertVersion(db(), {
        listingId: id,
        version: 2,
        status: 'in_review',
      });

      await expect(repository.archiveAll(id, seller)).rejects.toBeInstanceOf(
        ListingVersionConflictError,
      );
      expect(await statuses(id)).toEqual({ 1: 'published', 2: 'in_review' });
      expect(await events(id)).toEqual([]);
      expect(await outboxMessages(id)).toEqual([]);
    });

    it('recusa anúncio já totalmente arquivado', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'archived',
      });

      await expect(repository.archiveAll(id, seller)).rejects.toBeInstanceOf(
        ListingVersionConflictError,
      );
    });
  });

  describe('concorrência', () => {
    it('duas edições criando a próxima versão: uma conclui, a outra conflita', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });
      await insertImages(db(), id, 1, [0]);

      const results = await Promise.allSettled([
        repository.createNextVersion(
          { listingId: id, version: 1 },
          seller,
          aContent(),
        ),
        repository.createNextVersion(
          { listingId: id, version: 1 },
          seller,
          aContent(),
        ),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(ListingVersionConflictError);
    });
  });
});
