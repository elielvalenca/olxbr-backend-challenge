import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { validateEnv } from '../shared/config/env.js';
import { runMigrations } from '../shared/database/migrate.js';
import { assertResettable, dropEverything } from '../shared/database/reset.js';

const USAGE = 'Uso: node dist/cli/db.js <migrate|reset>';

/**
 * Manutenção do banco, fora do processo da API/worker.
 *   migrate  aplica as migrations pendentes (usado também no deploy)
 *   reset    apaga tudo e reaplica as migrations (só fora de produção)
 */
async function main(command: string | undefined): Promise<void> {
  if (command !== 'migrate' && command !== 'reset') {
    throw new Error(USAGE);
  }
  const env = validateEnv(process.env);
  if (command === 'reset') assertResettable(env.NODE_ENV);

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    if (command === 'reset') {
      await dropEverything(db);
      console.log('Banco limpo.');
    }
    await runMigrations(db);
    console.log('Migrations aplicadas.');
  } finally {
    await pool.end();
  }
}

try {
  await main(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
