import { toListingContent } from './seed-ads.js';

describe('toListingContent', () => {
  const ad = {
    id: 4,
    title: 'Fone Bluetooth JBL',
    description: 'Em otimo estado',
    price: 1027.14,
    category: 'eletronicos',
  };

  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(toListingContent(ad).priceCents).toBe(102_714);
    expect(toListingContent({ ...ad, price: 80 }).priceCents).toBe(8000);
    expect(toListingContent({ ...ad, price: 19.99 }).priceCents).toBe(1999);
  });

  it('inclui a imagem placeholder do anúncio', () => {
    expect(toListingContent(ad).imageUrls).toEqual([
      'https://picsum.photos/seed/4/800/600',
    ]);
  });

  it('preserva título, descrição e categoria', () => {
    expect(toListingContent(ad)).toMatchObject({
      title: ad.title,
      description: ad.description,
      category: 'eletronicos',
    });
  });
});
