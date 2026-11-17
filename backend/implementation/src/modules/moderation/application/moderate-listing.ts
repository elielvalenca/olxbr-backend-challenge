import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_ACTOR } from '../../listings/domain/actor.js';
import { ListingVersionConflictError } from '../../listings/domain/listing-errors.js';
import {
  LISTING_REPOSITORY,
  type ListingRepository,
  type VersionRef,
} from '../../listings/application/listing-repository.js';
import {
  MODERATION_GATEWAY,
  type ModerationGateway,
} from './moderation-gateway.js';

export type ModerationOutcome = 'published' | 'rejected' | 'ignored';

@Injectable()
export class ModerateListing {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
    @Inject(MODERATION_GATEWAY) private readonly gateway: ModerationGateway,
  ) {}

  /**
   * Modera uma versão em revisão e aplica o resultado. Idempotente: se a
   * versão já não está `in_review` (reprocesso, job duplicado, resultado
   * concorrente), nada é alterado. Falhas de integração propagam como erro.
   */
  async execute(ref: VersionRef): Promise<ModerationOutcome> {
    const version = await this.repository.findVersion(ref);
    if (version?.status !== 'in_review') return 'ignored';

    const verdict = await this.gateway.check(version.content);
    const details = { actor: SYSTEM_ACTOR, expectedFrom: 'in_review' } as const;
    try {
      if (verdict.status === 'approved') {
        await this.repository.publishReplacing(ref, details);
        return 'published';
      }
      await this.repository.transition(ref, 'rejected', {
        ...details,
        reason: verdict.reason,
      });
      return 'rejected';
    } catch (error) {
      // Outro processamento resolveu a versão enquanto o serviço respondia.
      if (error instanceof ListingVersionConflictError) return 'ignored';
      throw error;
    }
  }
}
