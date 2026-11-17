import type { ListingContent } from '../../listings/application/listing-repository.js';

/** Veredito de negócio do serviço de moderação. */
export type ModerationVerdict =
  { status: 'approved' } | { status: 'rejected'; reason: string };

/**
 * Serviço externo de moderação. Falhas de integração saem como os erros
 * tipados abaixo; só um veredito (aprovado/reprovado) é resultado de negócio.
 */
export interface ModerationGateway {
  check(content: ListingContent): Promise<ModerationVerdict>;
}

export const MODERATION_GATEWAY = Symbol('ModerationGateway');

/** `5xx`, tempo limite ou falha de rede: vale repetir com backoff. */
export class ModerationTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationTransientError';
  }
}

/** `429` ou circuito aberto: o consumo deve pausar, sem gastar tentativa. */
export class ModerationUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'ModerationUnavailableError';
  }
}

/** `400`: o payload não é aceito e repetir não adianta. */
export class ModerationInvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationInvalidRequestError';
  }
}
