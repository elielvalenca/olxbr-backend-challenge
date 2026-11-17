import { sql } from 'drizzle-orm';
import {
  insertVersion,
  newListingId,
} from '../../../test/support/listing-fixtures.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/support/postgres.js';
import { runMigrations } from './migrate.js';
import { dropEverything } from './reset.js';

describe('dropEverything + runMigrations', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('apaga os dados e recria o schema pelas migrations', async () => {
    const { db } = testDb;
    await insertVersion(db, { listingId: newListingId(), version: 1 });

    await dropEverything(db);
    const afterDrop = await db.execute(
      sql`SELECT to_regclass('public.listings') AS listings`,
    );
    expect(afterDrop.rows[0]?.listings).toBeNull();

    await runMigrations(db);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM listings`);
    expect(rows.rows[0]?.n).toBe(0);
    const outbox = await db.execute(
      sql`SELECT count(*)::int AS n FROM nest_outbox.migrations`,
    );
    expect(outbox.rows[0]?.n).toBe(1);
  });
});
