import { Module } from '@nestjs/common';
import { ListingQueriesModule } from '../listings/listing-queries.module.js';
import { ProjectListing } from './application/project-listing.js';
import { ProjectionWorker } from './infrastructure/projection-worker.js';
import { ProjectionCacheModule } from './projection-cache.module.js';

/** Consumidor da fila `projection`, só no processo do worker; alimentada pelo relay do outbox. */
@Module({
  imports: [ListingQueriesModule, ProjectionCacheModule],
  providers: [ProjectListing, ProjectionWorker],
})
export class ProjectionModule {}
