import { PostgresOutboxStore, fromDrizzle } from '@nestjs/outbox/postgres';
import { sql } from 'drizzle-orm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/support/postgres.js';

const schemaExists = async (testDb: TestDatabase) =>
  (
    await testDb.db.execute(
      sql`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'nest_outbox'`,
    )
  ).rows.length === 1;

describe('schema do outbox (migration do Drizzle)', () => {
  describe('banco migrado', () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
      testDb = await startTestDatabase();
    });

    afterAll(async () => {
      await testDb.stop();
    });

    it('cria o schema nest_outbox com as tabelas do pacote', async () => {
      const result = await testDb.db.execute(
        sql`SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'nest_outbox' ORDER BY table_name`,
      );

      expect(result.rows.map((r) => r.table_name)).toEqual([
        'dead_letters',
        'inbox',
        'messages',
        'migrations',
      ]);
    });

    it('inicia o store com migrate: false sem migrar por conta própria', async () => {
      const store = new PostgresOutboxStore({
        executor: fromDrizzle(testDb.db),
        migrate: false,
      });

      await store.onModuleInit();

      await expect(store.stats(Date.now())).resolves.toBeDefined();
      const versions = await testDb.db.execute(
        sql`SELECT version FROM nest_outbox.migrations ORDER BY version`,
      );
      expect(versions.rows).toEqual([
        { version: PostgresOutboxStore.schemaVersion },
      ]);
    });
  });

  describe('banco sem migrations', () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
      testDb = await startTestDatabase({ migrate: false });
    });

    afterAll(async () => {
      await testDb.stop();
    });

    it('falha no início em vez de criar o schema sozinho', async () => {
      const store = new PostgresOutboxStore({
        executor: fromDrizzle(testDb.db),
        migrate: false,
      });

      await expect(store.onModuleInit()).rejects.toMatchObject({
        name: 'OutboxSchemaError',
      });
      expect(await schemaExists(testDb)).toBe(false);
    });
  });
});
