import type { ListingStatus } from '../domain/listing-status.js';

export interface ListingListItem {
  listingId: string;
  title: string;
  priceCents: number;
  category: string;
  publishedAt: Date;
  /** Imagem de menor posição da versão publicada. */
  coverImageUrl: string | null;
}

export interface ListingPage {
  items: ListingListItem[];
  /** Anúncios que casam com o filtro, independente da página. */
  total: number;
  offset: number;
  limit: number;
}

/** Detalhe de uma versão; o do dono acrescenta o motivo da reprovação. */
export interface ListingDetail {
  listingId: string;
  version: number;
  status: ListingStatus;
  title: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrls: string[];
  publishedAt: Date | null;
}

export interface OwnListingDetail extends ListingDetail {
  /** Só presente quando `status` é `rejected`. */
  rejectionReason?: string;
}

/** Leituras do anúncio; a regra de visibilidade é o filtro de cada consulta. */
export interface ListingQueries {
  /** Versões `published`, da mais recente para a mais antiga, com o total do filtro. */
  listPublished(filter: {
    category?: string;
    offset: number;
    limit: number;
  }): Promise<{ items: ListingListItem[]; total: number }>;

  /** Versão `published` do anúncio, ou `null` se não houver. */
  findPublished(listingId: string): Promise<ListingDetail | null>;

  /** Versão mais recente do anúncio se for do vendedor, ou `null`. */
  findLatestForSeller(
    listingId: string,
    sellerId: string,
  ): Promise<OwnListingDetail | null>;
}

export const LISTING_QUERIES = Symbol('ListingQueries');
