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
export class SubmitListing {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
  ) {}

  /** Envia o rascunho mais recente para a moderação (`draft` → `in_review`). */
  async execute(sellerId: string, listingId: string): Promise<ListingSummary> {
    const latest = await findOwnedListing(this.repository, listingId, sellerId);
    assertTransition(latest.status, 'in_review');
    await this.repository.submit(latest.ref, sellerActor(sellerId));
    return { ...latest.ref, status: 'in_review' };
  }
}
