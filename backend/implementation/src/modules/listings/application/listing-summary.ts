import type { ListingStatus } from '../domain/listing-status.js';

/** Resposta dos casos de uso de escrita: identifica a versão afetada e o status resultante. */
export interface ListingSummary {
  listingId: string;
  version: number;
  status: ListingStatus;
}
