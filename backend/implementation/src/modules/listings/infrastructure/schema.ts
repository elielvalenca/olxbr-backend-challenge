import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { LISTING_STATUSES } from '../domain/listing-status.js';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Uma linha por VERSÃO do anúncio (append-only). `listing_id` é compartilhado
 * pelas versões e não tem tabela própria. Invariantes de unicidade ficam no
 * banco; limites de negócio ajustáveis (tamanho do título, categorias,
 * número de imagens) ficam na aplicação.
 */
export const listings = pgTable(
  'listings',
  {
    listingId: uuid('listing_id').notNull(),
    version: integer('version').notNull(),
    sellerId: text('seller_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    category: text('category').notNull(),
    status: text('status').$type<(typeof LISTING_STATUSES)[number]>().notNull(),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    submittedAt: timestamptz('submitted_at'),
    publishedAt: timestamptz('published_at'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.version] }),
    check('listings_price_positive', sql`${t.priceCents} > 0`),
    check(
      'listings_status_known',
      sql`${t.status} IN (${sql.join(
        LISTING_STATUSES.map((s) => sql.raw(`'${s}'`)),
        sql`, `,
      )})`,
    ),
    // No máximo uma versão publicada por anúncio.
    uniqueIndex('listings_one_published')
      .on(t.listingId)
      .where(sql`${t.status} = 'published'`),
    // No máximo uma versão aberta (rascunho ou em revisão) por anúncio.
    uniqueIndex('listings_one_open')
      .on(t.listingId)
      .where(sql`${t.status} IN ('draft', 'in_review')`),
    // Listagem pública: publicados, com e sem filtro de categoria.
    index('listings_published_by_category')
      .on(t.category, t.publishedAt.desc())
      .where(sql`${t.status} = 'published'`),
    index('listings_published_recent')
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'published'`),
    // Versões de um dono.
    index('listings_by_seller').on(t.sellerId, t.listingId),
  ],
);

/** Imagens (URLs) de uma versão; copiadas ao criar uma nova versão. */
export const listingImages = pgTable(
  'listing_images',
  {
    listingId: uuid('listing_id').notNull(),
    version: integer('version').notNull(),
    position: integer('position').notNull(),
    url: text('url').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.version, t.position] }),
    foreignKey({
      name: 'listing_images_version_fk',
      columns: [t.listingId, t.version],
      foreignColumns: [listings.listingId, listings.version],
    }).onDelete('cascade'),
    check('listing_images_position_non_negative', sql`${t.position} >= 0`),
  ],
);

/** Trilha append-only de transições de status; escrita pela aplicação. */
export const listingAuditEvents = pgTable(
  'listing_audit_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    listingId: uuid('listing_id').notNull(),
    version: integer('version').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    /** `seller_id` do vendedor ou `system`. */
    actor: text('actor').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'listing_audit_events_version_fk',
      columns: [t.listingId, t.version],
      foreignColumns: [listings.listingId, listings.version],
    }),
    index('listing_audit_events_by_version').on(t.listingId, t.version, t.id),
  ],
);
