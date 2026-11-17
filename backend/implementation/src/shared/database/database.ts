import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDrizzleToken } from '@nestjs/drizzle';

/** Banco Drizzle sobre o driver `pg`. Injetado com `@Inject(DATABASE)`. */
export type Database = NodePgDatabase;

/** Transação aberta por `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Token de injeção do banco registrado pelo `DatabaseModule`. */
export const DATABASE = getDrizzleToken();
