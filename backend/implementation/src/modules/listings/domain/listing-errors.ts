/** A versão (listing_id, version) não existe. */
export class ListingVersionNotFoundError extends Error {
  constructor(listingId: string, version: number) {
    super(`Versão ${version} do anúncio ${listingId} não encontrada`);
    this.name = 'ListingVersionNotFoundError';
  }
}

/**
 * Uma escrita concorrente já ocupou a versão, o rascunho aberto ou a vaga de
 * versão publicada. Quem chamou decide: erro de negócio (edição) ou retry (worker).
 */
export class ListingVersionConflictError extends Error {
  constructor(listingId: string) {
    super(`Conflito de versão no anúncio ${listingId}`);
    this.name = 'ListingVersionConflictError';
  }
}

/** O anúncio não existe ou não pertence a quem pediu (indistinguíveis de propósito). */
export class ListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`Anúncio ${listingId} não encontrado`);
    this.name = 'ListingNotFoundError';
  }
}

/** A transição de status pedida não é permitida pelo ciclo de vida. */
export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** A versão mais recente não aceita edição (`in_review` ou `archived`). */
export class ListingNotEditableError extends Error {
  constructor(status: string) {
    super(`Anúncio em ${status} não pode ser editado`);
    this.name = 'ListingNotEditableError';
  }
}
