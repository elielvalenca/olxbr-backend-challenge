import type { ListingContent } from '../modules/listings/application/listing-repository.js';

/** Anúncio do `api-mock/seed/ads.json` (preço em reais, sem imagens). */
export interface SeedAd {
  id: number;
  title: string;
  description: string;
  price: number;
  category: string;
}

/** Converte o anúncio do seed no conteúdo aceito pela API: preço em centavos e uma imagem placeholder. */
export function toListingContent(ad: SeedAd): ListingContent {
  return {
    title: ad.title,
    description: ad.description,
    priceCents: Math.round(ad.price * 100),
    category: ad.category,
    imageUrls: [`https://picsum.photos/seed/${ad.id}/800/600`],
  };
}
