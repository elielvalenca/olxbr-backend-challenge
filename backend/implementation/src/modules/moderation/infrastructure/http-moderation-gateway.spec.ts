import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ResilienceModule } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import type { Env } from '../../../shared/config/env.js';
import {
  ModerationInvalidRequestError,
  ModerationTransientError,
  ModerationUnavailableError,
} from '../application/moderation-gateway.js';
import { HttpModerationGateway } from './http-moderation-gateway.js';

const content = {
  title: 'Bicicleta aro 29 seminova',
  description: 'Pouco uso',
  priceCents: 150_000,
  category: 'esportes',
  imageUrls: [],
};

type Handler = (body: Record<string, unknown>) => {
  status: number;
  json?: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
};

describe('HttpModerationGateway', () => {
  let server: Server;
  let handler: Handler;
  let calls: Record<string, unknown>[];
  let url: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        calls.push(body);
        const { status, json, headers, delayMs = 0 } = handler(body);
        setTimeout(() => {
          res.writeHead(status, {
            'content-type': 'application/json',
            ...headers,
          });
          res.end(JSON.stringify(json ?? {}));
        }, delayMs);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server.close());

  beforeEach(() => {
    calls = [];
  });

  /** Gateway novo (cada um com o seu circuito) com a configuração do teste. */
  async function gateway(overrides: Partial<Env> = {}) {
    const env = {
      MODERATION_API_URL: url,
      MODERATION_TIMEOUT_MS: 200,
      MODERATION_BREAKER_FAILURE_RATE: 50,
      MODERATION_BREAKER_MIN_CALLS: 4,
      MODERATION_BREAKER_OPEN_MS: 60_000,
      ...overrides,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [ResilienceModule.forRoot()],
      providers: [
        HttpModerationGateway,
        { provide: ConfigService, useValue: { get: (k: keyof Env) => env[k] } },
      ],
    }).compile();
    return moduleRef.get(HttpModerationGateway);
  }

  it('envia o preço em reais', async () => {
    handler = () => ({ status: 200, json: { status: 'approved' } });
    const verdict = await (await gateway()).check(content);

    expect(verdict).toEqual({ status: 'approved' });
    expect(calls[0]).toEqual({
      title: content.title,
      description: content.description,
      price: 1500,
      category: 'esportes',
    });
  });

  it.each([
    ['rejection_reason', { rejection_reason: 'prohibited_item' }],
    ['reason', { reason: 'prohibited_item' }],
  ])('aceita o motivo em %s', async (_, extra) => {
    handler = () => ({
      status: 200,
      json: { status: 'rejected', ...extra },
    });

    expect(await (await gateway()).check(content)).toEqual({
      status: 'rejected',
      reason: 'prohibited_item',
    });
  });

  it('classifica 5xx como transitório', async () => {
    handler = () => ({ status: 500 });
    await expect((await gateway()).check(content)).rejects.toBeInstanceOf(
      ModerationTransientError,
    );
  });

  it('classifica estouro do tempo limite como transitório', async () => {
    handler = () => ({
      status: 200,
      json: { status: 'approved' },
      delayMs: 500,
    });
    await expect((await gateway()).check(content)).rejects.toBeInstanceOf(
      ModerationTransientError,
    );
  });

  it('classifica 429 respeitando Retry-After', async () => {
    handler = () => ({ status: 429, headers: { 'retry-after': '2' } });
    await expect((await gateway()).check(content)).rejects.toMatchObject({
      name: 'ModerationUnavailableError',
      retryAfterMs: 2000,
    });
  });

  it('classifica 400 como definitivo', async () => {
    handler = () => ({ status: 400, json: { error: 'validation_error' } });
    await expect((await gateway()).check(content)).rejects.toBeInstanceOf(
      ModerationInvalidRequestError,
    );
  });

  it('abre o circuito após falhas e deixa de chamar o serviço', async () => {
    handler = () => ({ status: 500 });
    const gw = await gateway();
    for (let i = 0; i < 4; i++) {
      await expect(gw.check(content)).rejects.toBeInstanceOf(
        ModerationTransientError,
      );
    }
    const before = calls.length;

    await expect(gw.check(content)).rejects.toBeInstanceOf(
      ModerationUnavailableError,
    );
    expect(calls).toHaveLength(before);
  });

  it('429 e 400 não abrem o circuito', async () => {
    handler = () => ({ status: 429 });
    const gw = await gateway();
    for (let i = 0; i < 6; i++) {
      await expect(gw.check(content)).rejects.toBeInstanceOf(
        ModerationUnavailableError,
      );
    }
    expect(calls).toHaveLength(6);
  });
});
