import { ListingNotFoundError } from '../domain/listing-errors.js';
import type {
  PublicDetailCache,
  ProjectionRebuildRequester,
} from '../../projection/application/public-detail-cache.js';
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
  const setup = (
    options: {
      cached?: ListingDetail | null | Error;
      published?: ListingDetail | null;
      requestFails?: boolean;
    } = {},
  ) => {
    const { cached = null, published = null, requestFails = false } = options;
    const cache = {
      get:
        cached instanceof Error
          ? vi.fn().mockRejectedValue(cached)
          : vi.fn().mockResolvedValue(cached),
      set: vi.fn(),
      remove: vi.fn(),
    } satisfies PublicDetailCache;
    const rebuild = {
      request: requestFails
        ? vi.fn().mockRejectedValue(new Error('fila fora do ar'))
        : vi.fn().mockResolvedValue(undefined),
    } satisfies ProjectionRebuildRequester;
    const findPublished = vi.fn().mockResolvedValue(published);
    const useCase = new GetPublicListing(
      queries({ findPublished }),
      cache,
      rebuild,
    );
    return { useCase, cache, rebuild, findPublished };
  };

  it('hit: devolve a projeção sem consultar o banco', async () => {
    const { useCase, findPublished, rebuild } = setup({ cached: detail });

    await expect(useCase.execute('l1')).resolves.toBe(detail);
    expect(findPublished).not.toHaveBeenCalled();
    expect(rebuild.request).not.toHaveBeenCalled();
  });

  it('miss de anúncio publicado: lê do banco e pede a reconstrução', async () => {
    const { useCase, rebuild } = setup({ published: detail });

    await expect(useCase.execute('l1')).resolves.toBe(detail);
    expect(rebuild.request).toHaveBeenCalledWith('l1');
  });

  it('erro ou tempo limite do cache: lê do banco, sem erro', async () => {
    const { useCase } = setup({
      cached: new Error('Command timed out'),
      published: detail,
    });

    await expect(useCase.execute('l1')).resolves.toBe(detail);
  });

  it('sem versão publicada: não encontrado, sem pedir reconstrução', async () => {
    const { useCase, rebuild } = setup();

    await expect(useCase.execute('l1')).rejects.toThrow(ListingNotFoundError);
    expect(rebuild.request).not.toHaveBeenCalled();
  });

  it('falha ao pedir a reconstrução não afeta a resposta', async () => {
    const { useCase } = setup({ published: detail, requestFails: true });

    await expect(useCase.execute('l1')).resolves.toBe(detail);
  });

  it('a leitura nunca escreve no cache', async () => {
    const { useCase, cache } = setup({ published: detail });

    await useCase.execute('l1');

    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.remove).not.toHaveBeenCalled();
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
