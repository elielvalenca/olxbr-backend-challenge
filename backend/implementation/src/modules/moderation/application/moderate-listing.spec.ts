import { SYSTEM_ACTOR } from '../../listings/domain/actor.js';
import { ListingVersionConflictError } from '../../listings/domain/listing-errors.js';
import type {
  LatestVersion,
  ListingRepository,
} from '../../listings/application/listing-repository.js';
import { ModerateListing } from './moderate-listing.js';
import {
  ModerationTransientError,
  type ModerationGateway,
} from './moderation-gateway.js';

const ref = { listingId: 'l-1', version: 2 };
const version = (status: LatestVersion['status']): LatestVersion => ({
  ref,
  sellerId: 's-1',
  status,
  content: {
    title: 'Bicicleta aro 29 seminova',
    description: 'Pouco uso',
    priceCents: 150_000,
    category: 'esportes',
    imageUrls: ['https://cdn.example.com/1.jpg'],
  },
});

function setup(status: LatestVersion['status'] | null = 'in_review') {
  const repository = {
    findVersion: vi.fn().mockResolvedValue(status && version(status)),
    publishReplacing: vi.fn().mockResolvedValue(undefined),
    transition: vi.fn().mockResolvedValue(undefined),
  };
  const check = vi.fn().mockResolvedValue({ status: 'approved' });
  const gateway: ModerationGateway = { check };
  const useCase = new ModerateListing(
    repository as unknown as ListingRepository,
    gateway,
  );
  return { repository, gateway, check, useCase };
}

describe('ModerateListing', () => {
  it('publica a versão aprovada exigindo que ainda esteja em revisão', async () => {
    const { repository, useCase } = setup();

    expect(await useCase.execute(ref)).toBe('published');
    expect(repository.publishReplacing).toHaveBeenCalledWith(ref, {
      actor: SYSTEM_ACTOR,
      expectedFrom: 'in_review',
    });
  });

  it('rejeita com o motivo do serviço', async () => {
    const { repository, check, useCase } = setup();
    check.mockResolvedValue({
      status: 'rejected',
      reason: 'prohibited_item',
    });

    expect(await useCase.execute(ref)).toBe('rejected');
    expect(repository.transition).toHaveBeenCalledWith(ref, 'rejected', {
      actor: SYSTEM_ACTOR,
      expectedFrom: 'in_review',
      reason: 'prohibited_item',
    });
  });

  it.each(['published', 'rejected', 'archived', 'draft'] as const)(
    'ignora versão %s sem chamar o serviço',
    async (status) => {
      const { check, repository, useCase } = setup(status);

      expect(await useCase.execute(ref)).toBe('ignored');
      expect(check).not.toHaveBeenCalled();
      expect(repository.publishReplacing).not.toHaveBeenCalled();
    },
  );

  it('ignora versão inexistente', async () => {
    const { useCase } = setup(null);
    expect(await useCase.execute(ref)).toBe('ignored');
  });

  it('descarta o resultado se a versão foi resolvida durante a chamada', async () => {
    const { repository, useCase } = setup();
    repository.publishReplacing.mockRejectedValue(
      new ListingVersionConflictError('l-1'),
    );

    expect(await useCase.execute(ref)).toBe('ignored');
  });

  it('propaga falha de integração sem alterar o anúncio', async () => {
    const { check, repository, useCase } = setup();
    check.mockRejectedValue(new ModerationTransientError('HTTP 500'));

    await expect(useCase.execute(ref)).rejects.toBeInstanceOf(
      ModerationTransientError,
    );
    expect(repository.publishReplacing).not.toHaveBeenCalled();
    expect(repository.transition).not.toHaveBeenCalled();
  });
});
