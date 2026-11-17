import { ListingNotFoundError } from '../domain/listing-errors.js';
import type { LatestVersion, ListingRepository } from './listing-repository.js';

/**
 * Versão mais recente do anúncio, se pertencer ao vendedor. Anúncio de outro
 * vendedor é indistinguível de inexistente, para não revelar que ele existe.
 */
export async function findOwnedListing(
  repository: ListingRepository,
  listingId: string,
  sellerId: string,
): Promise<LatestVersion> {
  const latest = await repository.findLatest(listingId);
  if (!latest || latest.sellerId !== sellerId) {
    throw new ListingNotFoundError(listingId);
  }
  return latest;
}
