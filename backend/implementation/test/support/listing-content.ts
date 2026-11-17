import type { ListingContent } from '../../src/modules/listings/application/listing-repository.js';

export const aContent = (
  overrides: Partial<ListingContent> = {},
): ListingContent => ({
  title: 'Bicicleta aro 29 seminova',
  description: 'Pouco uso, revisada.',
  priceCents: 150_000,
  category: 'esportes',
  imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  ...overrides,
});
