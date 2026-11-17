import { Inject, Injectable } from '@nestjs/common';
import { ListingNotFoundError } from '../domain/listing-errors.js';
import {
  LISTING_QUERIES,
  type ListingDetail,
  type ListingQueries,
} from './listing-queries.js';

@Injectable()
export class GetPublicListing {
  constructor(
    @Inject(LISTING_QUERIES) private readonly queries: ListingQueries,
  ) {}

  /** Só a versão publicada; qualquer outra situação é "não encontrado". */
  async execute(listingId: string): Promise<ListingDetail> {
    const detail = await this.queries.findPublished(listingId);
    if (!detail) throw new ListingNotFoundError(listingId);
    return detail;
  }
}
