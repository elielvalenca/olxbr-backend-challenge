import type { ListingDetail } from '../../listings/application/listing-queries.js';

/**
 * Projeção do detalhe público (só a versão `published`). A API só chama `get`;
 * `set` e `remove` são do worker de projeção, o único escritor.
 */
export interface PublicDetailCache {
  /** Payload projetado, ou `null` em miss. Lança se o cache falhar ou estourar o tempo limite. */
  get(listingId: string): Promise<ListingDetail | null>;
  set(detail: ListingDetail): Promise<void>;
  remove(listingId: string): Promise<void>;
}

/** Pede a reconstrução da projeção de um anúncio (miss na leitura). */
export interface ProjectionRebuildRequester {
  request(listingId: string): Promise<void>;
}

export const PUBLIC_DETAIL_CACHE = Symbol('PublicDetailCache');
export const PROJECTION_REBUILD_REQUESTER = Symbol(
  'ProjectionRebuildRequester',
);
