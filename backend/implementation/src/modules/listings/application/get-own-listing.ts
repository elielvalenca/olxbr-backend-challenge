import { Inject, Injectable } from '@nestjs/common';
import { ListingNotFoundError } from '../domain/listing-errors.js';
import {
  LISTING_QUERIES,
  type ListingQueries,
  type OwnListingDetail,
} from './listing-queries.js';

@Injectable()
export class GetOwnListing {
  constructor(
    @Inject(LISTING_QUERIES) private readonly queries: ListingQueries,
  ) {}

  /** Versão mais recente em qualquer status; anúncio de outro vendedor é "não encontrado". */
  async execute(
    sellerId: string,
    listingId: string,
  ): Promise<OwnListingDetail> {
    const detail = await this.queries.findLatestForSeller(listingId, sellerId);
    if (!detail) throw new ListingNotFoundError(listingId);
    return detail;
  }
}
