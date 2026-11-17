import { z } from 'zod';

/**
 * Variáveis de ambiente validadas na inicialização. Uma variável inválida
 * derruba o processo no boot, em vez de falhar no primeiro uso.
 * Novas variáveis entram aqui à medida que forem usadas.
 */
const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .describe('URL de conexão do Postgres'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve ter ao menos 32 caracteres')
    .describe('Segredo de assinatura dos tokens JWT (HS256)'),
  REDIS_URL: z
    .url({ protocol: /^rediss?$/ })
    .default('redis://localhost:6379')
    .describe('Redis das filas BullMQ'),
  MODERATION_API_URL: z
    .url()
    .default('http://localhost:8787')
    .describe('Base URL da API de moderação (mock)'),
  MODERATION_TIMEOUT_MS: positiveInt(3000),
  MODERATION_ATTEMPTS: positiveInt(5),
  MODERATION_BACKOFF_MS: positiveInt(1000),
  MODERATION_RATE_LIMIT_PER_SECOND: positiveInt(5),
  MODERATION_CONCURRENCY: positiveInt(5),
  MODERATION_BREAKER_FAILURE_RATE: z.coerce.number().gt(0).max(100).default(50),
  MODERATION_BREAKER_MIN_CALLS: positiveInt(5),
  MODERATION_BREAKER_OPEN_MS: positiveInt(10_000),
  OUTBOX_POLL_INTERVAL_MS: positiveInt(1000),
  LISTINGS_DEFAULT_PAGE_SIZE: positiveInt(20),
  LISTINGS_MAX_PAGE_SIZE: positiveInt(50),
  DETAIL_CACHE_TIMEOUT_MS: positiveInt(200),
  DETAIL_CACHE_TTL_SECONDS: positiveInt(86_400),
});

/** Falha no boot se o limite padrão da listagem exceder o máximo. */
const envSchemaChecked = envSchema.refine(
  (env) => env.LISTINGS_DEFAULT_PAGE_SIZE <= env.LISTINGS_MAX_PAGE_SIZE,
  {
    path: ['LISTINGS_DEFAULT_PAGE_SIZE'],
    message:
      'LISTINGS_DEFAULT_PAGE_SIZE não pode exceder LISTINGS_MAX_PAGE_SIZE',
  },
);

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchemaChecked.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
