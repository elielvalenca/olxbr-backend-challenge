import { sql } from 'drizzle-orm';
import type { Database } from './database.js';

/** Schemas que pertencem a este serviço: aplicação, outbox e controle de migrations do Drizzle. */
const OWNED_SCHEMAS = ['nest_outbox', 'drizzle'] as const;

/**
 * Apaga todos os dados e o schema, deixando o banco vazio (sem migrations).
 * Destrutivo: o chamador decide se o ambiente permite (ver `assertResettable`).
 */
export async function dropEverything(db: Database): Promise<void> {
  for (const schema of OWNED_SCHEMAS) {
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  }
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
}

/** Recusa limpar o banco em produção. */
export function assertResettable(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new Error('db:reset é destrutivo e não roda com NODE_ENV=production');
  }
}
