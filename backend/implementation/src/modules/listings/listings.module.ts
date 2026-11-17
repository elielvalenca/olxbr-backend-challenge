import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/auth/auth.module.js';
import { ApiOutboxModule } from '../../shared/outbox/outbox.module.js';
import { ArchiveListing } from './application/archive-listing.js';
import { CreateListing } from './application/create-listing.js';
import { GetOwnListing } from './application/get-own-listing.js';
import { GetPublicListing } from './application/get-public-listing.js';
import { ListPublishedListings } from './application/list-published-listings.js';
import { LISTING_QUERIES } from './application/listing-queries.js';
import { EditListing } from './application/edit-listing.js';
import { SubmitListing } from './application/submit-listing.js';
import { ListingQueriesController } from './http/listing-queries.controller.js';
import { ListingsController } from './http/listings.controller.js';
import { MyListingsController } from './http/my-listings.controller.js';
import { DrizzleListingQueries } from './infrastructure/drizzle-listing-queries.js';
import { ListingRepositoryModule } from './listing-repository.module.js';

@Module({
  imports: [AuthModule, ApiOutboxModule, ListingRepositoryModule],
  controllers: [
    ListingsController,
    ListingQueriesController,
    MyListingsController,
  ],
  providers: [
    CreateListing,
    EditListing,
    SubmitListing,
    ArchiveListing,
    ListPublishedListings,
    GetPublicListing,
    GetOwnListing,
    { provide: LISTING_QUERIES, useClass: DrizzleListingQueries },
  ],
})
export class ListingsModule {}
