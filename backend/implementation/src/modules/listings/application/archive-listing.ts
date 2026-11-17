import { Inject, Injectable } from '@nestjs/common';
import { sellerActor } from '../domain/actor.js';
import { assertTransition } from '../domain/listing-status.js';
import { findOwnedListing } from './find-owned-listing.js';
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from './listing-repository.js';
import type { ListingSummary } from './listing-summary.js';

@Injectable()
export class ArchiveListing {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
  ) {}

  /** Arquiva o anúncio inteiro (todas as versões não arquivadas). */
  async execute(sellerId: string, listingId: string): Promise<ListingSummary> {
    const latest = await findOwnedListing(this.repository, listingId, sellerId);
    assertTransition(latest.status, 'archived');
    await this.repository.archiveAll(listingId, sellerActor(sellerId));
    return { ...latest.ref, status: 'archived' };
  }
}
