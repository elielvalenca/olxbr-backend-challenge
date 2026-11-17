import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { listings } from '../src/modules/listings/infrastructure/schema.js';
import { DATABASE, type Database } from '../src/shared/database/database.js';
import { aContent } from './support/listing-content.js';

const SECRET = 'e2e-secret-com-mais-de-32-caracteres-abc';

interface Summary {
  listingId: string;
  version: number;
  status: string;
}

describe('API de leitura de anúncios', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = new JwtService({ secret: SECRET });
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = async (sub: string) =>
    `Bearer ${await jwt.signAsync({ sub })}`;
  const SELLER = 'e2e-reader-1';

  const create = async (seller = SELLER): Promise<Summary> => {
    const res = await http()
      .post('/listings')
      .set('Authorization', await bearer(seller))
      .send(aContent())
      .expect(201);
    return res.body;
  };

  /** Faz o papel da moderação: força o status da versão 1. */
  const force = (
    listingId: string,
    set: Partial<typeof listings.$inferInsert>,
  ) => db.update(listings).set(set).where(eq(listings.listingId, listingId));

  const publish = async (seller = SELLER) => {
    const created = await create(seller);
    await force(created.listingId, {
      status: 'published',
      publishedAt: new Date(),
    });
    return created.listingId;
  };

  describe('detalhe público', () => {
    it('publicado: 200 sem token, sem expor o vendedor', async () => {
      const listingId = await publish();

      const res = await http().get(`/listings/${listingId}`).expect(200);

      expect(res.body).toMatchObject({
        listingId,
        version: 1,
        status: 'published',
        priceCents: 150_000,
        imageUrls: aContent().imageUrls,
      });
      expect(res.body).not.toHaveProperty('sellerId');
      expect(res.body).not.toHaveProperty('rejectionReason');
    });

    it('ignora o token, mesmo inválido', async () => {
      const listingId = await publish();
      const expired = await jwt.signAsync({ sub: SELLER }, { expiresIn: -10 });

      await http()
        .get(`/listings/${listingId}`)
        .set('Authorization', `Bearer ${expired}`)
        .expect(200);
    });

    it.each(['draft', 'in_review', 'rejected', 'archived'] as const)(
      '404 quando a única versão está %s, inclusive para o dono',
      async (status) => {
        const created = await create();
        await force(created.listingId, { status, rejectionReason: 'x' });

        await http()
          .get(`/listings/${created.listingId}`)
          .set('Authorization', await bearer(SELLER))
          .expect(404);
      },
    );

    it('404 para inexistente e para id que não é UUID', async () => {
      await http().get(`/listings/${crypto.randomUUID()}`).expect(404);
      await http().get('/listings/nao-e-uuid').expect(404);
    });
  });

  describe('detalhe do dono', () => {
    it('401 sem token ou com token inválido', async () => {
      const { listingId } = await create();
      const expired = await jwt.signAsync({ sub: SELLER }, { expiresIn: -10 });

      await http().get(`/me/listings/${listingId}`).expect(401);
      await http()
        .get(`/me/listings/${listingId}`)
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('vê o rascunho, que o público não vê', async () => {
      const { listingId } = await create();

      const res = await http()
        .get(`/me/listings/${listingId}`)
        .set('Authorization', await bearer(SELLER))
        .expect(200);

      expect(res.body).toMatchObject({ version: 1, status: 'draft' });
      await http().get(`/listings/${listingId}`).expect(404);
    });

    it('vê a reprovação com o motivo', async () => {
      const { listingId } = await create();
      await force(listingId, {
        status: 'rejected',
        rejectionReason: 'price_out_of_range',
      });

      const res = await http()
        .get(`/me/listings/${listingId}`)
        .set('Authorization', await bearer(SELLER))
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'rejected',
        rejectionReason: 'price_out_of_range',
      });
    });

    it('404 para anúncio de outro vendedor, inexistente e id inválido', async () => {
      const listingId = await publish(SELLER);
      const other = await bearer('e2e-reader-2');

      await http()
        .get(`/me/listings/${listingId}`)
        .set('Authorization', other)
        .expect(404);
      await http()
        .get(`/me/listings/${crypto.randomUUID()}`)
        .set('Authorization', other)
        .expect(404);
      await http()
        .get('/me/listings/nao-e-uuid')
        .set('Authorization', other)
        .expect(404);
    });
  });

  describe('listagem', () => {
    it('pública, com publicados e capa, e sem rascunhos', async () => {
      const published = await publish();
      const draft = (await create()).listingId;

      const res = await http().get('/listings?limit=50').expect(200);
      const ids = res.body.items.map((i: { listingId: string }) => i.listingId);

      expect(ids).toContain(published);
      expect(ids).not.toContain(draft);
      expect(
        res.body.items.find(
          (i: { listingId: string }) => i.listingId === published,
        ),
      ).toMatchObject({
        title: aContent().title,
        coverImageUrl: aContent().imageUrls[0],
      });
      expect(res.body).toMatchObject({ offset: 0, limit: 50 });
    });

    it('usa os padrões e filtra por categoria', async () => {
      await publish();

      const res = await http().get('/listings?category=esportes').expect(200);

      expect(res.body).toMatchObject({ offset: 0, limit: 20 });
      expect(
        res.body.items.every(
          (i: { category: string }) => i.category === 'esportes',
        ),
      ).toBe(true);
    });

    it.each([
      'limit=51',
      'limit=0',
      'limit=abc',
      'offset=-1',
      'offset=1.5',
      'category=animais',
    ])('400 para %s', async (query) => {
      await http().get(`/listings?${query}`).expect(400);
    });
  });
});
