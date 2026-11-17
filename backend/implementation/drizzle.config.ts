import { defineConfig } from 'drizzle-kit';

// O schema do outbox (`nest_outbox`) não é declarado aqui: entra por uma
// migration custom e o drizzle-kit só enxerga o schema `public`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/listings/infrastructure/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
