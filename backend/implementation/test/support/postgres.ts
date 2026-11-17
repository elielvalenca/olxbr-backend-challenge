import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../../src/shared/database/database.js';
import { runMigrations } from '../../src/shared/database/migrate.js';

export interface TestDatabase {
  db: Database;
  pool: Pool;
  url: string;
  /** Encerra o pool e derruba o container. */
  stop(): Promise<void>;
}

/**
 * Sobe um Postgres real (mesma major do docker-compose) e aplica as
 * migrations do projeto. Cada arquivo de teste de integração cria o seu.
 */
export async function startTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const url = container.getConnectionUri();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  if (options.migrate ?? true) {
    await runMigrations(db);
  }
  return {
    db,
    pool,
    url,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
