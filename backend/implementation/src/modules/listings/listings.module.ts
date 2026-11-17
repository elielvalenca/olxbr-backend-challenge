import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/auth/auth.module.js';
import { ApiOutboxModule } from '../../shared/outbox/outbox.module.js';
import { ArchiveListing } from './application/archive-listing.js';
import { CreateListing } from './application/create-listing.js';
import { EditListing } from './application/edit-listing.js';
import { LISTING_REPOSITORY } from './application/listing-repository.js';
import { SubmitListing } from './application/submit-listing.js';
import { ListingsController } from './http/listings.controller.js';
import { DrizzleListingRepository } from './infrastructure/drizzle-listing-repository.js';

@Module({
  imports: [AuthModule, ApiOutboxModule],
  controllers: [ListingsController],
  providers: [
    { provide: LISTING_REPOSITORY, useClass: DrizzleListingRepository },
    CreateListing,
    EditListing,
    SubmitListing,
    ArchiveListing,
  ],
})
export class ListingsModule {}
