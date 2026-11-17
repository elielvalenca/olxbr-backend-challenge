import {
  insertImages,
  insertVersion,
  newListingId,
} from '../../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { DrizzleListingQueries } from './drizzle-listing-queries.js';

describe('DrizzleListingQueries', () => {
  let testDb: TestDatabase;
  let queries: DrizzleListingQueries;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    queries = new DrizzleListingQueries(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.pool.query(
      'truncate listing_images, listing_audit_events, listings',
    );
  });

  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

  /** Insere uma versão publicada com imagens nas posições dadas. */
  const publish = async (
    minutes: number,
    extra: Parameters<typeof insertVersion>[1] extends infer R
      ? Partial<R>
      : never = {},
    positions = [0],
  ) => {
    const listingId = newListingId();
    await insertVersion(testDb.db, {
      listingId,
      version: 1,
      status: 'published',
      publishedAt: at(minutes),
      ...extra,
    });
    await insertImages(testDb.db, listingId, 1, positions);
    return listingId;
  };

  describe('listPublished', () => {
    it('lista só versões publicadas, da mais recente para a mais antiga', async () => {
      const old = await publish(1);
      const recent = await publish(5);
      const draftId = newListingId();
      await insertVersion(testDb.db, { listingId: draftId, version: 1 });

      const { items, total } = await queries.listPublished({
        offset: 0,
        limit: 10,
      });

      expect(items.map((i) => i.listingId)).toEqual([recent, old]);
      expect(total).toBe(2);
    });

    it('mostra a versão publicada mesmo com versão nova em revisão', async () => {
      const listingId = await publish(1, {
        title: 'Título da versão publicada',
      });
      await insertVersion(testDb.db, {
        listingId,
        version: 2,
        status: 'in_review',
        title: 'Título da versão em revisão',
      });

      const { items } = await queries.listPublished({ offset: 0, limit: 10 });

      expect(items.map((i) => i.title)).toEqual(['Título da versão publicada']);
    });

    it('traz a imagem de menor posição como capa', async () => {
      const listingId = await publish(1, {}, [2, 0, 1]);

      const { items } = await queries.listPublished({ offset: 0, limit: 10 });

      expect(items[0]?.coverImageUrl).toBe(
        `https://cdn.example.com/${listingId}/1/0.jpg`,
      );
    });

    it('cada anúncio traz a própria capa, não a de outro', async () => {
      const first = await publish(1, {}, [0]);
      const second = await publish(2, {}, [3, 1]);

      const { items } = await queries.listPublished({ offset: 0, limit: 10 });

      const coverOf = (id: string) =>
        items.find((i) => i.listingId === id)?.coverImageUrl;
      expect(coverOf(first)).toBe(`https://cdn.example.com/${first}/1/0.jpg`);
      expect(coverOf(second)).toBe(`https://cdn.example.com/${second}/1/1.jpg`);
    });

    it('pagina com total independente da página', async () => {
      for (let i = 1; i <= 5; i++) await publish(i);

      const page = await queries.listPublished({ offset: 2, limit: 2 });
      const beyond = await queries.listPublished({ offset: 10, limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(5);
      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(5);
    });

    it('filtra por categoria, com total refletindo o filtro', async () => {
      await publish(1, { category: 'moveis' });
      await publish(2, { category: 'moveis' });
      await publish(3, { category: 'veiculos' });

      const moveis = await queries.listPublished({
        category: 'moveis',
        offset: 0,
        limit: 10,
      });
      const none = await queries.listPublished({
        category: 'imoveis',
        offset: 0,
        limit: 10,
      });

      expect(moveis.items.every((i) => i.category === 'moveis')).toBe(true);
      expect(moveis.total).toBe(2);
      expect(none).toEqual({ items: [], total: 0 });
    });

    it('mantém a ordem estável entre páginas quando published_at empata', async () => {
      for (let i = 0; i < 5; i++) await publish(1);

      const all = await queries.listPublished({ offset: 0, limit: 5 });
      const pages = [
        ...(await queries.listPublished({ offset: 0, limit: 2 })).items,
        ...(await queries.listPublished({ offset: 2, limit: 2 })).items,
        ...(await queries.listPublished({ offset: 4, limit: 2 })).items,
      ];

      expect(pages.map((i) => i.listingId)).toEqual(
        all.items.map((i) => i.listingId),
      );
    });
  });

  describe('findPublished', () => {
    it('devolve a publicada mesmo com versão mais nova aberta ou reprovada', async () => {
      const listingId = await publish(1, {}, [1, 0]);
      await insertVersion(testDb.db, {
        listingId,
        version: 2,
        status: 'rejected',
        rejectionReason: 'price_out_of_range',
      });

      const detail = await queries.findPublished(listingId);

      expect(detail).toMatchObject({ version: 1, status: 'published' });
      expect(detail?.imageUrls).toEqual([
        `https://cdn.example.com/${listingId}/1/0.jpg`,
        `https://cdn.example.com/${listingId}/1/1.jpg`,
      ]);
      expect(detail).not.toHaveProperty('rejectionReason');
      expect(detail).not.toHaveProperty('sellerId');
    });

    it.each(['draft', 'in_review', 'rejected', 'archived'] as const)(
      'sem versão publicada (%s), devolve null',
      async (status) => {
        const listingId = newListingId();
        await insertVersion(testDb.db, { listingId, version: 1, status });

        expect(await queries.findPublished(listingId)).toBeNull();
      },
    );

    it('anúncio inexistente, devolve null', async () => {
      expect(await queries.findPublished(newListingId())).toBeNull();
    });
  });

  describe('findLatestForSeller', () => {
    it('devolve a versão mais recente, mesmo com outra publicada', async () => {
      const listingId = await publish(1, { sellerId: 'seller-1' });
      await insertVersion(testDb.db, {
        listingId,
        version: 2,
        sellerId: 'seller-1',
        status: 'in_review',
      });

      const detail = await queries.findLatestForSeller(listingId, 'seller-1');

      expect(detail).toMatchObject({ version: 2, status: 'in_review' });
    });

    it('traz o motivo só quando reprovado', async () => {
      const rejected = newListingId();
      await insertVersion(testDb.db, {
        listingId: rejected,
        version: 1,
        status: 'rejected',
        rejectionReason: 'price_out_of_range',
      });
      const draft = newListingId();
      await insertVersion(testDb.db, { listingId: draft, version: 1 });

      expect(
        await queries.findLatestForSeller(rejected, 'seller-1'),
      ).toMatchObject({ rejectionReason: 'price_out_of_range' });
      expect(
        await queries.findLatestForSeller(draft, 'seller-1'),
      ).not.toHaveProperty('rejectionReason');
    });

    it('anúncio de outro vendedor ou inexistente, devolve null', async () => {
      const listingId = await publish(1, { sellerId: 'seller-1' });

      expect(
        await queries.findLatestForSeller(listingId, 'seller-2'),
      ).toBeNull();
      expect(
        await queries.findLatestForSeller(newListingId(), 'seller-1'),
      ).toBeNull();
    });
  });
});
