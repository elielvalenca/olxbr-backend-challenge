import { Inject, Injectable } from '@nestjs/common';
import { sellerActor } from '../domain/actor.js';
import {
  LISTING_REPOSITORY,
  type ListingContent,
  type ListingRepository,
} from './listing-repository.js';
import type { ListingSummary } from './listing-summary.js';

@Injectable()
export class CreateListing {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
  ) {}

  /** `content` já validado por `listingContentSchema`. */
  async execute(
    sellerId: string,
    content: ListingContent,
  ): Promise<ListingSummary> {
    const ref = await this.repository.createFirstVersion({
      sellerId,
      content,
      actor: sellerActor(sellerId),
    });
    return { ...ref, status: 'draft' };
  }
}
