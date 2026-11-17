import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { aContent } from './support/listing-content.js';

const SECRET = 'e2e-secret-com-mais-de-32-caracteres-abc';

describe('API de escrita de anúncios', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = new JwtService({ secret: SECRET });
  });

  afterAll(async () => {
    await app.close();
  });

  const bearer = async (sub: string) =>
    `Bearer ${await jwt.signAsync({ sub })}`;
  const http = () => request(app.getHttpServer());

  const createListing = async (sub = 'e2e-seller-1') => {
    const res = await http()
      .post('/listings')
      .set('Authorization', await bearer(sub))
      .send(aContent())
      .expect(201);
    return res.body as { listingId: string; version: number; status: string };
  };

  it('fluxo: criar → editar → enviar → editar e arquivar recusados', async () => {
    const auth = await bearer('e2e-seller-1');
    const created = await createListing();
    expect(created).toMatchObject({ version: 1, status: 'draft' });

    await http()
      .patch(`/listings/${created.listingId}`)
      .set('Authorization', auth)
      .send({ priceCents: 99_900 })
      .expect(200)
      .expect({ ...created });

    await http()
      .post(`/listings/${created.listingId}/submit`)
      .set('Authorization', auth)
      .expect(200)
      .expect({ ...created, status: 'in_review' });

    await http()
      .patch(`/listings/${created.listingId}`)
      .set('Authorization', auth)
      .send({ priceCents: 1 })
      .expect(409);
    await http()
      .post(`/listings/${created.listingId}/archive`)
      .set('Authorization', auth)
      .expect(409);
  });

  it('arquiva um rascunho', async () => {
    const created = await createListing();

    await http()
      .post(`/listings/${created.listingId}/archive`)
      .set('Authorization', await bearer('e2e-seller-1'))
      .expect(200)
      .expect({ ...created, status: 'archived' });
  });

  describe('autenticação', () => {
    it('401 sem token', () =>
      http().post('/listings').send(aContent()).expect(401));

    it('401 com assinatura inválida', async () => {
      const token = await new JwtService({ secret: 'x'.repeat(32) }).signAsync({
        sub: 'e2e-seller-1',
      });
      await http()
        .post('/listings')
        .set('Authorization', `Bearer ${token}`)
        .send(aContent())
        .expect(401);
    });

    it('401 com token expirado', async () => {
      const token = await jwt.signAsync({ sub: 's' }, { expiresIn: -10 });
      await http()
        .post('/listings')
        .set('Authorization', `Bearer ${token}`)
        .send(aContent())
        .expect(401);
    });

    it('401 com HS512 assinado com o segredo certo', async () => {
      const b64 = (v: object) =>
        Buffer.from(JSON.stringify(v)).toString('base64url');
      const head = b64({ alg: 'HS512', typ: 'JWT' });
      const body = b64({ sub: 's' });
      const sig = createHmac('sha512', SECRET)
        .update(`${head}.${body}`)
        .digest('base64url');
      await http()
        .post('/listings')
        .set('Authorization', `Bearer ${head}.${body}.${sig}`)
        .send(aContent())
        .expect(401);
    });
  });

  describe('validação (400)', () => {
    it('lista os campos inválidos', async () => {
      const res = await http()
        .post('/listings')
        .set('Authorization', await bearer('e2e-seller-1'))
        .send({ ...aContent(), title: 'curto', priceCents: 0 })
        .expect(400);

      expect(
        res.body.errors.map((e: { field: string }) => e.field).sort(),
      ).toEqual(['priceCents', 'title']);
    });

    it('edição vazia é inválida', async () => {
      const created = await createListing();
      await http()
        .patch(`/listings/${created.listingId}`)
        .set('Authorization', await bearer('e2e-seller-1'))
        .send({})
        .expect(400);
    });

    it('edição que viola uma regra é recusada', async () => {
      const created = await createListing();
      await http()
        .patch(`/listings/${created.listingId}`)
        .set('Authorization', await bearer('e2e-seller-1'))
        .send({ category: 'animais' })
        .expect(400);
    });
  });

  describe('dono e inexistente (404)', () => {
    it('anúncio de outro vendedor responde como inexistente', async () => {
      const created = await createListing('e2e-seller-1');
      const other = await bearer('e2e-seller-2');

      await http()
        .patch(`/listings/${created.listingId}`)
        .set('Authorization', other)
        .send({ priceCents: 1000 })
        .expect(404);
      await http()
        .post(`/listings/${created.listingId}/submit`)
        .set('Authorization', other)
        .expect(404);
      await http()
        .post(`/listings/${created.listingId}/archive`)
        .set('Authorization', other)
        .expect(404);
    });

    it('id inexistente ou que não é UUID', async () => {
      const auth = await bearer('e2e-seller-1');
      await http()
        .post(`/listings/${crypto.randomUUID()}/submit`)
        .set('Authorization', auth)
        .expect(404);
      await http()
        .post('/listings/nao-e-uuid/submit')
        .set('Authorization', auth)
        .expect(404);
    });
  });
});
