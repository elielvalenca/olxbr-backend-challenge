import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './database.js';

/** Pasta de migrations versionadas, gerada pelo drizzle-kit (raiz do projeto). */
export const MIGRATIONS_FOLDER = new URL('../../../drizzle', import.meta.url)
  .pathname;

/**
 * Aplica as migrations pendentes. Usado pelo `pnpm db:migrate` e pelos testes
 * de integração, para que todo ambiente rode o mesmo histórico.
 */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
