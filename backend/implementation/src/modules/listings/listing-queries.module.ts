import { Module } from '@nestjs/common';
import { LISTING_QUERIES } from './application/listing-queries.js';
import { DrizzleListingQueries } from './infrastructure/drizzle-listing-queries.js';

/** Leituras de anúncio no Postgres, compartilhadas pela API e pelo worker de projeção. */
@Module({
  providers: [{ provide: LISTING_QUERIES, useClass: DrizzleListingQueries }],
  exports: [LISTING_QUERIES],
})
export class ListingQueriesModule {}
