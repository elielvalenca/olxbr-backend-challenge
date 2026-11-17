import { Module } from '@nestjs/common';
import { LISTING_REPOSITORY } from './application/listing-repository.js';
import { DrizzleListingRepository } from './infrastructure/drizzle-listing-repository.js';

/**
 * Repositório de anúncios, compartilhado pela API e pelo worker. Usa o
 * `Outbox` global, que cada processo registra à sua maneira (API só grava;
 * worker também publica).
 */
@Module({
  providers: [
    { provide: LISTING_REPOSITORY, useClass: DrizzleListingRepository },
  ],
  exports: [LISTING_REPOSITORY],
})
export class ListingRepositoryModule {}
