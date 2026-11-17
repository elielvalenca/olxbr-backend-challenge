import { randomUUID } from 'node:crypto';
import type { Database } from '../../src/shared/database/database.js';
import { postgresErrorCode } from '../../src/shared/database/pg-errors.js';
import {
  listingImages,
  listings,
} from '../../src/modules/listings/infrastructure/schema.js';

export type ListingRow = typeof listings.$inferInsert;

export const newListingId = (): string => randomUUID();

/** Insere uma versão com valores válidos por padrão; sobrescreva o que importa no teste. */
export async function insertVersion(
  db: Database,
  row: Pick<ListingRow, 'listingId' | 'version'> & Partial<ListingRow>,
): Promise<void> {
  await db.insert(listings).values({
    sellerId: 'seller-1',
    title: 'Bicicleta aro 29 seminova',
    description: 'Pouco uso, revisada.',
    priceCents: 150_000,
    category: 'esportes',
    status: 'draft',
    ...row,
  });
}

export async function insertImages(
  db: Database,
  listingId: string,
  version: number,
  positions: number[],
): Promise<void> {
  await db.insert(listingImages).values(
    positions.map((position) => ({
      listingId,
      version,
      position,
      url: `https://cdn.example.com/${listingId}/${version}/${position}.jpg`,
    })),
  );
}

/** SQLSTATE do erro do Postgres, ou `undefined` se a operação não falhou. */
export async function pgErrorCode(
  operation: PromiseLike<unknown>,
): Promise<string | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === undefined) throw error;
    return code;
  }
}

/** SQLSTATEs usados nos testes. */
export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
} as const;
