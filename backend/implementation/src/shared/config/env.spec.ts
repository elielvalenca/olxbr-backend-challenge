import { validateEnv } from './env.js';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';
const JWT_SECRET = 'x'.repeat(32);
const base = { DATABASE_URL, JWT_SECRET };

describe('validateEnv', () => {
  it('aplica os valores padrão', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      JWT_SECRET,
      REDIS_URL: 'redis://localhost:6379',
      MODERATION_API_URL: 'http://localhost:8787',
      MODERATION_TIMEOUT_MS: 3000,
      MODERATION_ATTEMPTS: 5,
      MODERATION_BACKOFF_MS: 1000,
      MODERATION_RATE_LIMIT_PER_SECOND: 5,
      MODERATION_CONCURRENCY: 5,
      MODERATION_BREAKER_FAILURE_RATE: 50,
      MODERATION_BREAKER_MIN_CALLS: 5,
      MODERATION_BREAKER_OPEN_MS: 10_000,
      OUTBOX_POLL_INTERVAL_MS: 1000,
      LISTINGS_DEFAULT_PAGE_SIZE: 20,
      LISTINGS_MAX_PAGE_SIZE: 50,
      DETAIL_CACHE_TIMEOUT_MS: 200,
      DETAIL_CACHE_TTL_SECONDS: 86_400,
    });
  });

  it('rejeita configuração de moderação inválida', () => {
    expect(() => validateEnv({ ...base, MODERATION_ATTEMPTS: '0' })).toThrow(
      /MODERATION_ATTEMPTS/,
    );
    expect(() =>
      validateEnv({ ...base, MODERATION_BREAKER_FAILURE_RATE: '150' }),
    ).toThrow(/MODERATION_BREAKER_FAILURE_RATE/);
  });

  it('rejeita limite padrão de página acima do máximo', () => {
    expect(() =>
      validateEnv({
        ...base,
        LISTINGS_DEFAULT_PAGE_SIZE: '60',
        LISTINGS_MAX_PAGE_SIZE: '50',
      }),
    ).toThrow(/LISTINGS_DEFAULT_PAGE_SIZE/);
  });

  it('rejeita tempo limite e validade da projeção inválidos', () => {
    expect(() =>
      validateEnv({ ...base, DETAIL_CACHE_TIMEOUT_MS: 'x' }),
    ).toThrow(/DETAIL_CACHE_TIMEOUT_MS/);
    expect(() =>
      validateEnv({ ...base, DETAIL_CACHE_TTL_SECONDS: '0' }),
    ).toThrow(/DETAIL_CACHE_TTL_SECONDS/);
  });

  it('converte PORT de string para número', () => {
    expect(validateEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falha no boot com valor inválido', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(
      /Configuração inválida/,
    );
  });

  it('falha no boot sem DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejeita DATABASE_URL que não é de Postgres', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'mysql://u:p@localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('aceita o esquema postgresql://', () => {
    expect(
      validateEnv({ ...base, DATABASE_URL: 'postgresql://u:p@localhost/db' })
        .DATABASE_URL,
    ).toContain('postgresql://');
  });

  it('falha no boot sem JWT_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres', () => {
    expect(() => validateEnv({ DATABASE_URL, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
