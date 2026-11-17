import { and, asc, eq } from 'drizzle-orm';
import { aContent } from '../../../../test/support/listing-content.js';
import {
  insertImages,
  insertVersion,
  newListingId,
} from '../../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { SYSTEM_ACTOR, sellerActor } from '../domain/actor.js';
import {
  ListingVersionConflictError,
  ListingVersionNotFoundError,
} from '../domain/listing-errors.js';
import { DrizzleListingRepository } from './drizzle-listing-repository.js';
import { listingAuditEvents, listingImages, listings } from './schema.js';

describe('DrizzleListingRepository', () => {
  let testDb: TestDatabase;
  let repository: DrizzleListingRepository;
  const db = () => testDb.db;
  const seller = sellerActor('seller-1');

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new DrizzleListingRepository(testDb.db);
  });

  afterAll(async () => {
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

  const imagesOf = (listingId: string, version: number) =>
    db()
      .select({ position: listingImages.position, url: listingImages.url })
      .from(listingImages)
      .where(
        and(
          eq(listingImages.listingId, listingId),
          eq(listingImages.version, version),
        ),
      )
      .orderBy(asc(listingImages.position));

  describe('createFirstVersion', () => {
    it('cria a versão 1 em draft com as imagens na ordem recebida', async () => {
      const content = aContent();

      const ref = await repository.createFirstVersion({
        sellerId: 'seller-1',
        content,
        actor: seller,
      });

      expect(ref.version).toBe(1);
      expect(await statuses(ref.listingId)).toEqual({ 1: 'draft' });
      expect((await imagesOf(ref.listingId, 1)).map((i) => i.url)).toEqual(
        content.imageUrls,
      );
    });
  });

  describe('publishReplacing', () => {
    it('arquiva a versão publicada anterior e publica a nova na mesma operação', async () => {
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

      await repository.publishReplacing(
        { listingId: id, version: 2 },
        { actor: SYSTEM_ACTOR },
      );

      expect(await statuses(id)).toEqual({ 1: 'archived', 2: 'published' });
      const events = await db()
        .select()
        .from(listingAuditEvents)
        .where(eq(listingAuditEvents.listingId, id))
        .orderBy(asc(listingAuditEvents.id));
      expect(
        events.map((e) => [e.version, e.fromStatus, e.toStatus, e.actor]),
      ).toEqual([
        [1, 'published', 'archived', 'system'],
        [2, 'in_review', 'published', 'system'],
      ]);
      expect(events[0]?.metadata).toEqual({ replacedByVersion: 2 });
    });

    it('publica a primeira versão sem nada para arquivar', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'in_review',
      });

      await repository.publishReplacing(
        { listingId: id, version: 1 },
        { actor: SYSTEM_ACTOR },
      );

      expect(await statuses(id)).toEqual({ 1: 'published' });
    });

    it('desfaz o arquivamento quando a publicação da nova versão falha', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });

      await expect(
        repository.publishReplacing(
          { listingId: id, version: 2 },
          { actor: SYSTEM_ACTOR },
        ),
      ).rejects.toBeInstanceOf(ListingVersionNotFoundError);

      expect(await statuses(id)).toEqual({ 1: 'published' });
    });

    it('com publicações concorrentes, conclui sem violar a versão publicada única', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'archived',
      });
      await insertVersion(db(), {
        listingId: id,
        version: 2,
        status: 'archived',
      });

      const results = await Promise.allSettled([
        repository.publishReplacing(
          { listingId: id, version: 1 },
          { actor: SYSTEM_ACTOR },
        ),
        repository.publishReplacing(
          { listingId: id, version: 2 },
          { actor: SYSTEM_ACTOR },
        ),
      ]);

      const failures = results.filter((r) => r.status === 'rejected');
      for (const failure of failures) {
        expect(failure.reason).toBeInstanceOf(ListingVersionConflictError);
      }
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      const published = Object.values(await statuses(id)).filter(
        (s) => s === 'published',
      );
      expect(published).toHaveLength(1);
    });
  });

  describe('createNextVersion', () => {
    it('cria o rascunho da próxima versão copiando conteúdo e imagens', async () => {
      const first = await repository.createFirstVersion({
        sellerId: 'seller-1',
        content: aContent({
          imageUrls: [
            'https://cdn.example.com/1.jpg',
            'https://cdn.example.com/2.jpg',
            'https://cdn.example.com/3.jpg',
          ],
        }),
        actor: seller,
      });
      await repository.transition(first, 'in_review', { actor: seller });
      await repository.publishReplacing(first, { actor: SYSTEM_ACTOR });

      const next = await repository.createNextVersion(first, seller);

      expect(next).toEqual({ listingId: first.listingId, version: 2 });
      expect(await statuses(first.listingId)).toEqual({
        1: 'published',
        2: 'draft',
      });
      expect(await imagesOf(next.listingId, 2)).toEqual(
        await imagesOf(first.listingId, 1),
      );
      const [copied] = await db()
        .select()
        .from(listings)
        .where(
          and(eq(listings.listingId, first.listingId), eq(listings.version, 2)),
        );
      expect(copied).toMatchObject({
        title: 'Bicicleta aro 29 seminova',
        sellerId: 'seller-1',
        status: 'draft',
        publishedAt: null,
        rejectionReason: null,
      });
    });

    it('não altera as imagens da versão de origem quando a nova é alterada', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });
      await insertImages(db(), id, 1, [0, 1, 2]);
      const before = await imagesOf(id, 1);

      const next = await repository.createNextVersion(
        { listingId: id, version: 1 },
        seller,
      );
      await db()
        .update(listingImages)
        .set({ url: 'https://cdn.example.com/trocada.jpg' })
        .where(
          and(
            eq(listingImages.listingId, id),
            eq(listingImages.version, next.version),
          ),
        );

      expect(await imagesOf(id, 1)).toEqual(before);
    });

    it('cria a versão seguinte depois de uma rejeição', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'rejected',
      });

      const next = await repository.createNextVersion(
        { listingId: id, version: 1 },
        seller,
      );

      expect(next.version).toBe(2);
    });

    it('recusa criar um segundo rascunho enquanto há uma versão aberta', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'in_review',
      });

      await expect(
        repository.createNextVersion({ listingId: id, version: 1 }, seller),
      ).rejects.toBeInstanceOf(ListingVersionConflictError);
    });

    it('com edições concorrentes, só uma cria a próxima versão e a outra recebe conflito', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });

      const results = await Promise.allSettled([
        repository.createNextVersion({ listingId: id, version: 1 }, seller),
        repository.createNextVersion({ listingId: id, version: 1 }, seller),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        ListingVersionConflictError,
      );
    });

    it('falha de forma explícita quando a versão de origem não existe', async () => {
      await expect(
        repository.createNextVersion(
          { listingId: newListingId(), version: 1 },
          seller,
        ),
      ).rejects.toBeInstanceOf(ListingVersionNotFoundError);
    });
  });
});
