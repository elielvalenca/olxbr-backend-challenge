/** Status de uma versão do anúncio. */
export const LISTING_STATUSES = [
  'draft',
  'in_review',
  'rejected',
  'published',
  'archived',
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];
