import { ListingNotFoundError } from '../domain/listing-errors.js';
import { GetOwnListing } from './get-own-listing.js';
import { GetPublicListing } from './get-public-listing.js';
import type {
  ListingDetail,
  ListingQueries,
  OwnListingDetail,
} from './listing-queries.js';

const detail: ListingDetail = {
  listingId: 'l1',
  version: 1,
  status: 'published',
  title: 'Bicicleta aro 29 seminova',
  description: 'Pouco uso',
  priceCents: 150_000,
  category: 'esportes',
  imageUrls: ['https://cdn.example.com/a.jpg'],
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

const queries = (overrides: Partial<ListingQueries> = {}): ListingQueries => ({
  listPublished: vi.fn(),
  findPublished: vi.fn().mockResolvedValue(null),
  findLatestForSeller: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('GetPublicListing', () => {
  it('devolve a versão publicada', async () => {
    const useCase = new GetPublicListing(
      queries({ findPublished: vi.fn().mockResolvedValue(detail) }),
    );
    await expect(useCase.execute('l1')).resolves.toBe(detail);
  });

  it('sem versão publicada, não encontrado', async () => {
    await expect(new GetPublicListing(queries()).execute('l1')).rejects.toThrow(
      ListingNotFoundError,
    );
  });
});

describe('GetOwnListing', () => {
  it('devolve a versão mais recente com o motivo da reprovação', async () => {
    const rejected: OwnListingDetail = {
      ...detail,
      status: 'rejected',
      rejectionReason: 'price_out_of_range',
    };
    const findLatestForSeller = vi.fn().mockResolvedValue(rejected);

    const result = await new GetOwnListing(
      queries({ findLatestForSeller }),
    ).execute('seller-1', 'l1');

    expect(result).toBe(rejected);
    expect(findLatestForSeller).toHaveBeenCalledWith('l1', 'seller-1');
  });

  it('anúncio inexistente ou de outro vendedor, não encontrado', async () => {
    await expect(
      new GetOwnListing(queries()).execute('seller-1', 'l1'),
    ).rejects.toThrow(ListingNotFoundError);
  });
});
