import { z } from 'zod';

/**
 * Variáveis de ambiente validadas na inicialização. Uma variável inválida
 * derruba o processo no boot, em vez de falhar no primeiro uso.
 * Novas variáveis entram aqui à medida que forem usadas.
 */
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
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
