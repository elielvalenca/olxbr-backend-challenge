import { asc, eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { aContent } from '../../../../test/support/listing-content.js';
import { createTestOutbox } from '../../../../test/support/outbox.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import {
  InvalidTransitionError,
  ListingNotEditableError,
  ListingNotFoundError,
  ListingVersionConflictError,
} from '../domain/listing-errors.js';
import { DrizzleListingRepository } from '../infrastructure/drizzle-listing-repository.js';
import { listingAuditEvents, listings } from '../infrastructure/schema.js';
import { ArchiveListing } from './archive-listing.js';
import { CreateListing } from './create-listing.js';
import { EditListing } from './edit-listing.js';
import { SubmitListing } from './submit-listing.js';

describe('casos de uso de escrita do anúncio', () => {
  let testDb: TestDatabase;
  let testOutbox: Awaited<ReturnType<typeof createTestOutbox>>;
  let create: CreateListing;
  let edit: EditListing;
  let submit: SubmitListing;
  let archive: ArchiveListing;
  const db = () => testDb.db;
  const SELLER = 'seller-1';

  beforeAll(async () => {
    testDb = await startTestDatabase();
    testOutbox = await createTestOutbox(testDb.db);
    const repository = new DrizzleListingRepository(
      testDb.db,
      testOutbox.outbox,
    );
    create = new CreateListing(repository);
    edit = new EditListing(repository);
    submit = new SubmitListing(repository);
    archive = new ArchiveListing(repository);
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

  /** Cria um anúncio e força a versão 1 para o status desejado. */
  const createWithStatus = async (status: 'published' | 'rejected') => {
    const { listingId } = await create.execute(SELLER, aContent());
    await db()
      .update(listings)
      .set({ status })
      .where(eq(listings.listingId, listingId));
    return listingId;
  };

  describe('criar', () => {
    it('cria a versão 1 em draft para o vendedor', async () => {
      const summary = await create.execute(SELLER, aContent());

      expect(summary).toMatchObject({ version: 1, status: 'draft' });
      const [row] = await db()
        .select()
        .from(listings)
        .where(eq(listings.listingId, summary.listingId));
      expect(row?.sellerId).toBe(SELLER);
    });
  });

  describe('editar', () => {
    it('altera o rascunho no lugar, sem nova versão', async () => {
      const { listingId } = await create.execute(SELLER, aContent());

      const summary = await edit.execute(SELLER, listingId, {
        priceCents: 99_900,
      });

      expect(summary).toEqual({ listingId, version: 1, status: 'draft' });
      expect(await statuses(listingId)).toEqual({ 1: 'draft' });
    });

    it('cria nova versão draft a partir da publicada, preservando a original', async () => {
      const listingId = await createWithStatus('published');

      const summary = await edit.execute(SELLER, listingId, {
        title: 'Bicicleta aro 29 revisada',
      });

      expect(summary).toEqual({ listingId, version: 2, status: 'draft' });
      expect(await statuses(listingId)).toEqual({ 1: 'published', 2: 'draft' });
      const rows = await db()
        .select()
        .from(listings)
        .where(eq(listings.listingId, listingId))
        .orderBy(asc(listings.version));
      expect(rows.map((r) => r.title)).toEqual([
        'Bicicleta aro 29 seminova',
        'Bicicleta aro 29 revisada',
      ]);
    });

    it('cria nova versão a partir da rejeitada', async () => {
      const listingId = await createWithStatus('rejected');

      const summary = await edit.execute(SELLER, listingId, {
        priceCents: 120_000,
      });

      expect(summary.version).toBe(2);
      expect(await statuses(listingId)).toEqual({ 1: 'rejected', 2: 'draft' });
    });

    it('parte da versão mais recente: editar de novo altera o rascunho criado', async () => {
      const listingId = await createWithStatus('published');
      await edit.execute(SELLER, listingId, { priceCents: 100_000 });

      const second = await edit.execute(SELLER, listingId, {
        description: 'Nova descrição',
      });

      expect(second.version).toBe(2);
      expect(await statuses(listingId)).toEqual({ 1: 'published', 2: 'draft' });
    });

    it('recusa edição de versão em revisão', async () => {
      const { listingId } = await create.execute(SELLER, aContent());
      await submit.execute(SELLER, listingId);

      await expect(
        edit.execute(SELLER, listingId, { priceCents: 1 }),
      ).rejects.toBeInstanceOf(ListingNotEditableError);
    });

    it('recusa edição de anúncio arquivado', async () => {
      const { listingId } = await create.execute(SELLER, aContent());
      await archive.execute(SELLER, listingId);

      await expect(
        edit.execute(SELLER, listingId, { priceCents: 1 }),
      ).rejects.toBeInstanceOf(ListingNotEditableError);
    });

    it('trata anúncio de outro vendedor e inexistente como não encontrado', async () => {
      const { listingId } = await create.execute(SELLER, aContent());

      await expect(
        edit.execute('seller-2', listingId, { priceCents: 1 }),
      ).rejects.toBeInstanceOf(ListingNotFoundError);
      await expect(
        edit.execute(SELLER, crypto.randomUUID(), { priceCents: 1 }),
      ).rejects.toBeInstanceOf(ListingNotFoundError);
    });

    it('edição inválida não cria nem altera versão', async () => {
      const listingId = await createWithStatus('published');

      await expect(
        edit.execute(SELLER, listingId, { title: 'curto' }),
      ).rejects.toBeInstanceOf(ZodError);

      expect(await statuses(listingId)).toEqual({ 1: 'published' });
    });

    it('edições concorrentes: nunca mais de uma versão nova', async () => {
      const listingId = await createWithStatus('published');

      const results = await Promise.allSettled([
        edit.execute(SELLER, listingId, { priceCents: 111_000 }),
        edit.execute(SELLER, listingId, { priceCents: 222_000 }),
      ]);

      // O banco impede dois rascunhos. A edição que perdeu a corrida ou cai no
      // rascunho recém-criado (se leu depois do commit) ou recebe conflito.
      expect(await statuses(listingId)).toEqual({ 1: 'published', 2: 'draft' });
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(ListingVersionConflictError);
        }
      }
    });
  });

  describe('enviar para revisão', () => {
    it('envia o rascunho', async () => {
      const { listingId } = await create.execute(SELLER, aContent());

      const summary = await submit.execute(SELLER, listingId);

      expect(summary.status).toBe('in_review');
      expect(await statuses(listingId)).toEqual({ 1: 'in_review' });
    });

    it('recusa quando a versão mais recente não é rascunho', async () => {
      const listingId = await createWithStatus('published');

      await expect(submit.execute(SELLER, listingId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );
    });

    it('recusa enviar duas vezes', async () => {
      const { listingId } = await create.execute(SELLER, aContent());
      await submit.execute(SELLER, listingId);

      await expect(submit.execute(SELLER, listingId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );
    });

    it('outro vendedor não consegue enviar', async () => {
      const { listingId } = await create.execute(SELLER, aContent());

      await expect(
        submit.execute('seller-2', listingId),
      ).rejects.toBeInstanceOf(ListingNotFoundError);
    });
  });

  describe('arquivar', () => {
    it('arquiva publicada e rascunho aberto juntos', async () => {
      const listingId = await createWithStatus('published');
      await edit.execute(SELLER, listingId, { priceCents: 100_000 });

      await archive.execute(SELLER, listingId);

      expect(await statuses(listingId)).toEqual({
        1: 'archived',
        2: 'archived',
      });
    });

    it('recusa com versão em revisão, sem alterar nada', async () => {
      const listingId = await createWithStatus('published');
      await edit.execute(SELLER, listingId, { priceCents: 100_000 });
      await submit.execute(SELLER, listingId);

      await expect(archive.execute(SELLER, listingId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );
      expect(await statuses(listingId)).toEqual({
        1: 'published',
        2: 'in_review',
      });
    });

    it('recusa anúncio já arquivado', async () => {
      const { listingId } = await create.execute(SELLER, aContent());
      await archive.execute(SELLER, listingId);

      await expect(archive.execute(SELLER, listingId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );
    });
  });

  it('histórico de auditoria: um evento por transição, em ordem, com o vendedor como ator', async () => {
    const { listingId } = await create.execute(SELLER, aContent());
    await submit.execute(SELLER, listingId);
    await db()
      .update(listings)
      .set({ status: 'rejected' })
      .where(eq(listings.listingId, listingId));
    await archive.execute(SELLER, listingId);

    const events = await db()
      .select()
      .from(listingAuditEvents)
      .where(eq(listingAuditEvents.listingId, listingId))
      .orderBy(asc(listingAuditEvents.id));

    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      [null, 'draft', SELLER],
      ['draft', 'in_review', SELLER],
      ['rejected', 'archived', SELLER],
    ]);
  });
});
