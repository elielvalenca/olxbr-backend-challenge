import { sql } from 'drizzle-orm';
import { startTestDatabase, type TestDatabase } from './postgres.js';

describe('startTestDatabase', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('entrega um Postgres 18 acessível', async () => {
    const result = await testDb.db.execute(
      sql`SELECT 1 AS ok, current_setting('server_version_num')::int AS version`,
    );
    expect(result.rows[0]).toMatchObject({ ok: 1 });
    expect(Number(result.rows[0]?.version)).toBeGreaterThanOrEqual(180000);
  });

  it('aplica as migrations do projeto', async () => {
    const result = await testDb.db.execute(
      sql`SELECT to_regclass('public.listings') AS listings`,
    );
    expect(result.rows[0]?.listings).toBe('listings');
  });
});
