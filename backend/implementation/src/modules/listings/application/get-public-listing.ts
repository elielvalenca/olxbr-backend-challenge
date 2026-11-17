import { Inject, Injectable, Logger } from '@nestjs/common';
import { ListingNotFoundError } from '../domain/listing-errors.js';
import {
  PROJECTION_REBUILD_REQUESTER,
  PUBLIC_DETAIL_CACHE,
  type ProjectionRebuildRequester,
  type PublicDetailCache,
} from '../../projection/application/public-detail-cache.js';
import {
  LISTING_QUERIES,
  type ListingDetail,
  type ListingQueries,
} from './listing-queries.js';

@Injectable()
export class GetPublicListing {
  private readonly logger = new Logger(GetPublicListing.name);

  constructor(
    @Inject(LISTING_QUERIES) private readonly queries: ListingQueries,
    @Inject(PUBLIC_DETAIL_CACHE) private readonly cache: PublicDetailCache,
    @Inject(PROJECTION_REBUILD_REQUESTER)
    private readonly rebuild: ProjectionRebuildRequester,
  ) {}

  /**
   * Só a versão publicada, preferindo a projeção. Miss, erro ou tempo limite do
   * cache caem para o Postgres; qualquer situação sem versão publicada é "não
   * encontrado". A leitura nunca escreve no cache: um miss de anúncio publicado
   * só pede a reconstrução ao worker, sem esperar por ela.
   */
  async execute(listingId: string): Promise<ListingDetail> {
    const cached = await this.readCache(listingId);
    if (cached) return cached;

    const detail = await this.queries.findPublished(listingId);
    // Sem versão publicada não há o que reconstruir (evita fila cheia por ids aleatórios).
    if (!detail) throw new ListingNotFoundError(listingId);

    void this.rebuild
      .request(listingId)
      .catch((error: unknown) =>
        this.logger.warn(`Pedido de reconstrução falhou: ${String(error)}`),
      );
    return detail;
  }

  private async readCache(listingId: string): Promise<ListingDetail | null> {
    try {
      return await this.cache.get(listingId);
    } catch (error) {
      this.logger.warn(
        `Projeção indisponível, lendo do banco: ${String(error)}`,
      );
      return null;
    }
  }
}
