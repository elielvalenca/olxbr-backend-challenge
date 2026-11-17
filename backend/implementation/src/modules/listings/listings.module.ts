import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/auth/auth.module.js';
import { ApiOutboxModule } from '../../shared/outbox/outbox.module.js';
import { ArchiveListing } from './application/archive-listing.js';
import { CreateListing } from './application/create-listing.js';
import { GetOwnListing } from './application/get-own-listing.js';
import { GetPublicListing } from './application/get-public-listing.js';
import { ListPublishedListings } from './application/list-published-listings.js';
import { EditListing } from './application/edit-listing.js';
import { SubmitListing } from './application/submit-listing.js';
import { ListingQueriesController } from './http/listing-queries.controller.js';
import { ListingsController } from './http/listings.controller.js';
import { MyListingsController } from './http/my-listings.controller.js';
import { ListingQueriesModule } from './listing-queries.module.js';
import { ListingRepositoryModule } from './listing-repository.module.js';
import { ProjectionCacheModule } from '../projection/projection-cache.module.js';
import { ProjectionRequestsModule } from '../projection/projection-requests.module.js';

@Module({
  imports: [
    AuthModule,
    ApiOutboxModule,
    ListingRepositoryModule,
    ListingQueriesModule,
    ProjectionCacheModule,
    ProjectionRequestsModule,
  ],
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
  ],
})
export class ListingsModule {}
