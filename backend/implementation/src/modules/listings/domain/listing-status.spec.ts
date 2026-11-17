import {
  LISTING_STATUSES,
  assertTransition,
  canTransition,
  type ListingStatus,
} from './listing-status.js';
import { InvalidTransitionError } from './listing-errors.js';

const VALID: [ListingStatus, ListingStatus][] = [
  ['draft', 'in_review'],
  ['draft', 'archived'],
  ['in_review', 'published'],
  ['in_review', 'rejected'],
  ['rejected', 'archived'],
  ['published', 'archived'],
];

describe('transições de status', () => {
  it.each(VALID)('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('recusa todas as demais combinações (matriz 5×5)', () => {
    const isValid = (f: ListingStatus, t: ListingStatus) =>
      VALID.some(([vf, vt]) => vf === f && vt === t);
    for (const from of LISTING_STATUSES) {
      for (const to of LISTING_STATUSES) {
        if (isValid(from, to)) continue;
        expect(() => assertTransition(from, to), `${from} → ${to}`).toThrow(
          InvalidTransitionError,
        );
      }
    }
  });

  it('archived é final e in_review não pode ser arquivada', () => {
    expect(canTransition('archived', 'draft')).toBe(false);
    expect(canTransition('in_review', 'archived')).toBe(false);
  });
});
