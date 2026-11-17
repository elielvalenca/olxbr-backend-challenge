import { Inject, Injectable } from '@nestjs/common';
import {
  LISTING_QUERIES,
  type ListingQueries,
} from '../../listings/application/listing-queries.js';
import {
  PUBLIC_DETAIL_CACHE,
  type PublicDetailCache,
} from './public-detail-cache.js';

@Injectable()
export class ProjectListing {
  constructor(
    @Inject(LISTING_QUERIES) private readonly queries: ListingQueries,
    @Inject(PUBLIC_DETAIL_CACHE) private readonly cache: PublicDetailCache,
  ) {}

  /**
   * Alinha a projeção ao estado atual do banco: com versão publicada, grava o
   * payload; sem, remove. Não usa o conteúdo da mensagem, então repetição e
   * ordem trocada levam ao mesmo resultado.
   */
  async execute(listingId: string): Promise<void> {
    const detail = await this.queries.findPublished(listingId);
    if (detail) await this.cache.set(detail);
    else await this.cache.remove(listingId);
  }
}
