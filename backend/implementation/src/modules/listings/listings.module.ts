import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/auth/auth.module.js';
import { ApiOutboxModule } from '../../shared/outbox/outbox.module.js';
import { ArchiveListing } from './application/archive-listing.js';
import { CreateListing } from './application/create-listing.js';
import { EditListing } from './application/edit-listing.js';
import { SubmitListing } from './application/submit-listing.js';
import { ListingsController } from './http/listings.controller.js';
import { ListingRepositoryModule } from './listing-repository.module.js';

@Module({
  imports: [AuthModule, ApiOutboxModule, ListingRepositoryModule],
  controllers: [ListingsController],
  providers: [CreateListing, EditListing, SubmitListing, ArchiveListing],
})
export class ListingsModule {}
