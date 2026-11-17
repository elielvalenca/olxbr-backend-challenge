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
