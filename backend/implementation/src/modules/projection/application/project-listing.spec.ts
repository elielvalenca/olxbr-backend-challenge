import type {
  ListingDetail,
  ListingQueries,
} from '../../listings/application/listing-queries.js';
import { ProjectListing } from './project-listing.js';
import type { PublicDetailCache } from './public-detail-cache.js';

const detail: ListingDetail = {
  listingId: 'l1',
  version: 2,
  status: 'published',
  title: 'Bicicleta aro 29 seminova',
  description: 'Pouco uso',
  priceCents: 150_000,
  category: 'esportes',
  imageUrls: ['https://cdn.example.com/a.jpg'],
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('ProjectListing', () => {
  const setup = (published: ListingDetail | null) => {
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const cache: PublicDetailCache = { get: vi.fn(), set, remove };
    const queries = {
      findPublished: vi.fn().mockResolvedValue(published),
    } as unknown as ListingQueries;
    return { set, remove, useCase: new ProjectListing(queries, cache) };
  };

  it('grava o detalhe da versão publicada', async () => {
    const { set, remove, useCase } = setup(detail);

    await useCase.execute('l1');

    expect(set).toHaveBeenCalledWith(detail);
    expect(remove).not.toHaveBeenCalled();
  });

  it('sem versão publicada (arquivado), remove a projeção', async () => {
    const { set, remove, useCase } = setup(null);

    await useCase.execute('l1');

    expect(remove).toHaveBeenCalledWith('l1');
    expect(set).not.toHaveBeenCalled();
  });

  it('repetir o processamento tem o mesmo efeito', async () => {
    const { set, useCase } = setup(detail);

    await useCase.execute('l1');
    await useCase.execute('l1');

    expect(set.mock.calls).toEqual([[detail], [detail]]);
  });

  it('mensagem antiga de publicação depois do arquivamento não recria a projeção', async () => {
    // O estado atual (sem versão publicada) manda; o conteúdo da mensagem não é lido.
    const { set, remove, useCase } = setup(null);

    await useCase.execute('l1');
    await useCase.execute('l1');

    expect(set).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
