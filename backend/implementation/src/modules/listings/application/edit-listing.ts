import { Inject, Injectable } from '@nestjs/common';
import { sellerActor } from '../domain/actor.js';
import { ListingNotEditableError } from '../domain/listing-errors.js';
import { findOwnedListing } from './find-owned-listing.js';
import { mergeContent, type ListingChanges } from './listing-content.js';
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from './listing-repository.js';
import type { ListingSummary } from './listing-summary.js';

@Injectable()
export class EditListing {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
  ) {}

  /**
   * Edita a versão mais recente: `draft` é alterado no lugar; `published` e
   * `rejected` geram uma nova versão `draft` com as alterações.
   * @throws ZodError se o conteúdo resultante for inválido.
   */
  async execute(
    sellerId: string,
    listingId: string,
    changes: ListingChanges,
  ): Promise<ListingSummary> {
    const latest = await findOwnedListing(this.repository, listingId, sellerId);

    switch (latest.status) {
      case 'draft': {
        await this.repository.updateDraft(
          latest.ref,
          mergeContent(latest.content, changes),
        );
        return { ...latest.ref, status: 'draft' };
      }
      case 'published':
      case 'rejected': {
        const next = await this.repository.createNextVersion(
          latest.ref,
          sellerActor(sellerId),
          mergeContent(latest.content, changes),
        );
        return { ...next, status: 'draft' };
      }
      case 'in_review':
      case 'archived':
        throw new ListingNotEditableError(latest.status);
    }
  }
}
