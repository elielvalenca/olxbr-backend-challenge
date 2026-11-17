import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LISTING_CATEGORIES } from './listing-content.js';
import {
  LISTING_QUERIES,
  type ListingPage,
  type ListingQueries,
} from './listing-queries.js';

/** Query da listagem: `offset`/`limit` com padrão e máximo vindos da configuração. */
export const listingQuerySchema = (limits: {
  defaultLimit: number;
  maxLimit: number;
}) =>
  z.object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(limits.maxLimit)
      .default(limits.defaultLimit),
    category: z.enum(LISTING_CATEGORIES).optional(),
  });

export type ListingQuery = z.infer<ReturnType<typeof listingQuerySchema>>;

@Injectable()
export class ListPublishedListings {
  constructor(
    @Inject(LISTING_QUERIES) private readonly queries: ListingQueries,
  ) {}

  async execute(query: ListingQuery): Promise<ListingPage> {
    const { items, total } = await this.queries.listPublished(query);
    return { items, total, offset: query.offset, limit: query.limit };
  }
}
