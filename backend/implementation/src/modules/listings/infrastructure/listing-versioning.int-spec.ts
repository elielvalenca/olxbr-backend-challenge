import { and, asc, eq, sql } from 'drizzle-orm';
import {
  insertImages,
  insertVersion,
  newListingId,
  PG,
  pgErrorCode,
} from '../../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../test/support/postgres.js';
import { listingImages, listings } from './schema.js';

/** Invariantes de `listing-versioning` garantidas pelo banco. */
describe('listing-versioning (banco)', () => {
  let testDb: TestDatabase;
  const db = () => testDb.db;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  const statusOf = async (listingId: string, version: number) =>
    (
      await db()
        .select({ status: listings.status })
        .from(listings)
        .where(
          and(eq(listings.listingId, listingId), eq(listings.version, version)),
        )
    )[0]?.status;

  describe('identidade por anúncio e versão', () => {
    it('guarda versões distintas do mesmo anúncio', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });
      await insertVersion(db(), { listingId: id, version: 2, status: 'draft' });

      expect(await statusOf(id, 1)).toBe('published');
      expect(await statusOf(id, 2)).toBe('draft');
    });

    it('rejeita número de versão repetido no mesmo anúncio', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'archived',
      });

      const code = await pgErrorCode(
        insertVersion(db(), { listingId: id, version: 1, status: 'archived' }),
      );

      expect(code).toBe(PG.uniqueViolation);
    });
  });

  describe('no máximo uma versão publicada por anúncio', () => {
    it('rejeita publicar outra versão sem arquivar a anterior e não altera nenhuma', async () => {
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

      const code = await pgErrorCode(
        db()
          .update(listings)
          .set({ status: 'published' })
          .where(and(eq(listings.listingId, id), eq(listings.version, 2))),
      );

      expect(code).toBe(PG.uniqueViolation);
      expect(await statusOf(id, 1)).toBe('published');
      expect(await statusOf(id, 2)).toBe('in_review');
    });

    it('aceita publicar a nova versão depois de arquivar a anterior', async () => {
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

      await db().transaction(async (tx) => {
        await tx
          .update(listings)
          .set({ status: 'archived' })
          .where(and(eq(listings.listingId, id), eq(listings.version, 1)));
        await tx
          .update(listings)
          .set({ status: 'published' })
          .where(and(eq(listings.listingId, id), eq(listings.version, 2)));
      });

      expect(await statusOf(id, 1)).toBe('archived');
      expect(await statusOf(id, 2)).toBe('published');
    });

    it('com publicações concorrentes, no máximo uma conclui', async () => {
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

      const publish = (version: number) =>
        pgErrorCode(
          db().transaction(async (tx) => {
            await tx
              .update(listings)
              .set({ status: 'published' })
              .where(
                and(eq(listings.listingId, id), eq(listings.version, version)),
              );
            // segura a transação aberta para as duas se sobreporem
            await tx.execute(sql`SELECT pg_sleep(0.3)`);
          }),
        );

      const results = await Promise.all([publish(1), publish(2)]);

      expect(results.filter((code) => code === undefined)).toHaveLength(1);
      expect(
        results.filter((code) => code === PG.uniqueViolation),
      ).toHaveLength(1);
      const published = await db()
        .select()
        .from(listings)
        .where(
          and(eq(listings.listingId, id), eq(listings.status, 'published')),
        );
      expect(published).toHaveLength(1);
    });

    it('não faz anúncios diferentes competirem', async () => {
      const a = newListingId();
      const b = newListingId();

      await insertVersion(db(), {
        listingId: a,
        version: 1,
        status: 'published',
      });
      await insertVersion(db(), {
        listingId: b,
        version: 1,
        status: 'published',
      });

      expect(await statusOf(a, 1)).toBe('published');
      expect(await statusOf(b, 1)).toBe('published');
    });
  });

  describe('no máximo uma versão aberta por anúncio', () => {
    it.each(['draft', 'in_review'] as const)(
      'rejeita um novo rascunho enquanto existe uma versão %s',
      async (openStatus) => {
        const id = newListingId();
        await insertVersion(db(), {
          listingId: id,
          version: 1,
          status: openStatus,
        });

        const code = await pgErrorCode(
          insertVersion(db(), { listingId: id, version: 2, status: 'draft' }),
        );

        expect(code).toBe(PG.uniqueViolation);
      },
    );

    it.each(['rejected', 'published'] as const)(
      'aceita um novo rascunho depois de a versão aberta virar %s',
      async (closedStatus) => {
        const id = newListingId();
        await insertVersion(db(), {
          listingId: id,
          version: 1,
          status: closedStatus,
        });

        await insertVersion(db(), {
          listingId: id,
          version: 2,
          status: 'draft',
        });

        expect(await statusOf(id, 2)).toBe('draft');
      },
    );

    it('com edições concorrentes, no máximo uma cria a próxima versão', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'published',
      });

      const results = await Promise.all([
        pgErrorCode(
          insertVersion(db(), { listingId: id, version: 2, status: 'draft' }),
        ),
        pgErrorCode(
          insertVersion(db(), { listingId: id, version: 2, status: 'draft' }),
        ),
      ]);

      expect(results.filter((code) => code === undefined)).toHaveLength(1);
      expect(
        results.filter((code) => code === PG.uniqueViolation),
      ).toHaveLength(1);
    });
  });

  describe('status e motivo', () => {
    it('rejeita um status desconhecido', async () => {
      const code = await pgErrorCode(
        insertVersion(db(), {
          listingId: newListingId(),
          version: 1,
          status: 'pending' as never,
        }),
      );

      expect(code).toBe(PG.checkViolation);
    });

    it('armazena como recebido um motivo de reprovação novo', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        status: 'rejected',
        rejectionReason: 'motivo_novo_do_moderador',
      });

      const [row] = await db()
        .select({ reason: listings.rejectionReason })
        .from(listings)
        .where(eq(listings.listingId, id));

      expect(row?.reason).toBe('motivo_novo_do_moderador');
    });
  });

  describe('preço em centavos', () => {
    it.each([0, -1])('rejeita preço %i', async (priceCents) => {
      const code = await pgErrorCode(
        insertVersion(db(), {
          listingId: newListingId(),
          version: 1,
          priceCents,
        }),
      );

      expect(code).toBe(PG.checkViolation);
    });

    it('devolve o mesmo valor, sem perda de precisão', async () => {
      const id = newListingId();
      await insertVersion(db(), {
        listingId: id,
        version: 1,
        priceCents: 123_456,
      });

      const [row] = await db()
        .select({ price: listings.priceCents })
        .from(listings)
        .where(eq(listings.listingId, id));

      expect(row?.price).toBe(123_456);
    });
  });

  describe('limites de negócio fora do banco', () => {
    it.each([1, 10_000])(
      'aceita um título de %i caracteres (a validação é da aplicação)',
      async (length) => {
        const id = newListingId();
        await insertVersion(db(), {
          listingId: id,
          version: 1,
          title: 'x'.repeat(length),
        });

        const [row] = await db()
          .select({ title: listings.title })
          .from(listings)
          .where(eq(listings.listingId, id));

        expect(row?.title).toHaveLength(length);
      },
    );
  });

  describe('imagens', () => {
    it('rejeita duas imagens na mesma posição da mesma versão', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });
      await insertImages(db(), id, 1, [0]);

      const code = await pgErrorCode(insertImages(db(), id, 1, [0]));

      expect(code).toBe(PG.uniqueViolation);
    });

    it('rejeita posição negativa', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });

      const code = await pgErrorCode(insertImages(db(), id, 1, [-1]));

      expect(code).toBe(PG.checkViolation);
    });

    it('rejeita imagem de uma versão que não existe', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });

      const code = await pgErrorCode(insertImages(db(), id, 2, [0]));

      expect(code).toBe(PG.foreignKeyViolation);
    });

    it('devolve as imagens na ordem das posições', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });
      await insertImages(db(), id, 1, [2, 0, 1]);

      const rows = await db()
        .select({ position: listingImages.position })
        .from(listingImages)
        .where(eq(listingImages.listingId, id))
        .orderBy(asc(listingImages.position));

      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('não impõe um máximo de imagens (o limite é da aplicação)', async () => {
      const id = newListingId();
      await insertVersion(db(), { listingId: id, version: 1 });

      await insertImages(
        db(),
        id,
        1,
        Array.from({ length: 25 }, (_, i) => i),
      );

      const rows = await db()
        .select()
        .from(listingImages)
        .where(eq(listingImages.listingId, id));
      expect(rows).toHaveLength(25);
    });
  });
});
