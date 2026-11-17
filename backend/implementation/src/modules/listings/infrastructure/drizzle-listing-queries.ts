import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../shared/database/database.js';
import type {
  ListingDetail,
  ListingQueries,
  OwnListingDetail,
} from '../application/listing-queries.js';
import { listingImages, listings } from './schema.js';

@Injectable()
export class DrizzleListingQueries implements ListingQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listPublished(filter: {
    category?: string;
    offset: number;
    limit: number;
  }) {
    const where = and(
      eq(listings.status, 'published'),
      filter.category ? eq(listings.category, filter.category) : undefined,
    );

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select({
          listingId: listings.listingId,
          title: listings.title,
          priceCents: listings.priceCents,
          category: listings.category,
          publishedAt: listings.publishedAt,
          coverImageUrl: sql<string | null>`(
            select ${listingImages.url} from ${listingImages}
            where ${listingImages.listingId} = ${listings.listingId}
              and ${listingImages.version} = ${listings.version}
            order by ${listingImages.position} limit 1
          )`,
        })
        .from(listings)
        .where(where)
        // `listing_id` desempata `published_at` iguais, para a paginação ser estável.
        .orderBy(desc(listings.publishedAt), asc(listings.listingId))
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ total: count() }).from(listings).where(where),
    ]);

    return {
      // `published_at` é gravado na publicação; toda versão `published` o tem.
      items: items.map((item) => ({ ...item, publishedAt: item.publishedAt! })),
      total: totalRow?.total ?? 0,
    };
  }

  async findPublished(listingId: string): Promise<ListingDetail | null> {
    const [row] = await this.db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.listingId, listingId),
          eq(listings.status, 'published'),
        ),
      );
    return row ? this.toDetail(row) : null;
  }

  async findLatestForSeller(
    listingId: string,
    sellerId: string,
  ): Promise<OwnListingDetail | null> {
    const [row] = await this.db
      .select()
      .from(listings)
      .where(
        and(eq(listings.listingId, listingId), eq(listings.sellerId, sellerId)),
      )
      .orderBy(desc(listings.version))
      .limit(1);
    if (!row) return null;
    const detail = await this.toDetail(row);
    return row.status === 'rejected' && row.rejectionReason !== null
      ? { ...detail, rejectionReason: row.rejectionReason }
      : detail;
  }

  private async toDetail(
    row: typeof listings.$inferSelect,
  ): Promise<ListingDetail> {
    const images = await this.db
      .select({ url: listingImages.url })
      .from(listingImages)
      .where(
        and(
          eq(listingImages.listingId, row.listingId),
          eq(listingImages.version, row.version),
        ),
      )
      .orderBy(asc(listingImages.position));
    return {
      listingId: row.listingId,
      version: row.version,
      status: row.status,
      title: row.title,
      description: row.description,
      priceCents: row.priceCents,
      category: row.category,
      imageUrls: images.map((i) => i.url),
      publishedAt: row.publishedAt,
    };
  }
}
