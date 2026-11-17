import { InvalidTransitionError } from './listing-errors.js';

/** Status de uma versão do anúncio. */
export const LISTING_STATUSES = [
  'draft',
  'in_review',
  'rejected',
  'published',
  'archived',
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Transições de status permitidas. Editar uma versão `published`/`rejected`
 * não aparece aqui: cria uma nova versão `draft`, não muda o status da original.
 */
export const TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['published', 'rejected'],
  rejected: ['archived'],
  published: ['archived'],
  archived: [],
};

export const canTransition = (from: ListingStatus, to: ListingStatus) =>
  TRANSITIONS[from].includes(to);

/** @throws InvalidTransitionError se `from` → `to` não for permitida. */
export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
