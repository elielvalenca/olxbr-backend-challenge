import type { Actor } from '../domain/actor.js';
import type { ListingStatus } from '../domain/listing-status.js';

export interface VersionRef {
  listingId: string;
  version: number;
}

/** Conteúdo editável de uma versão. Os limites de negócio são validados antes, na aplicação. */
export interface ListingContent {
  title: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrls: string[];
}

export interface TransitionDetails {
  actor: Actor;
  /** Motivo (ex.: `rejection_reason` da moderação); vai para a versão rejeitada e para a auditoria. */
  reason?: string;
  /** Metadados livres, hoje sem uso; reservados para enriquecimento vindo da API. */
  metadata?: Record<string, unknown>;
}

/**
 * Persistência das versões do anúncio. Cada operação é atômica: a mudança de
 * status e o evento de auditoria são gravados na mesma transação. Conflitos
 * de concorrência viram `ListingVersionConflictError`.
 */
export interface ListingRepository {
  /** Cria a versão 1 em `draft`, com imagens e evento de auditoria. */
  createFirstVersion(input: {
    sellerId: string;
    content: ListingContent;
    actor: Actor;
  }): Promise<VersionRef>;

  /** Cria a próxima versão em `draft` copiando conteúdo e imagens da versão `from`. */
  createNextVersion(from: VersionRef, actor: Actor): Promise<VersionRef>;

  /** Muda o status de uma versão e registra o evento. A validade da transição é do domínio. */
  transition(
    ref: VersionRef,
    to: ListingStatus,
    details: TransitionDetails,
  ): Promise<void>;

  /**
   * Publica `ref`, arquivando antes (pelo sistema) a versão publicada anterior
   * do mesmo anúncio, se houver, na mesma transação.
   */
  publishReplacing(ref: VersionRef, details: TransitionDetails): Promise<void>;
}

export const LISTING_REPOSITORY = Symbol('ListingRepository');
