import { Module } from '@nestjs/common';
import { ResilienceModule } from '@nestjs/resilience';
import { ListingRepositoryModule } from '../listings/listing-repository.module.js';
import { ModerateListing } from './application/moderate-listing.js';
import { MODERATION_GATEWAY } from './application/moderation-gateway.js';
import { HttpModerationGateway } from './infrastructure/http-moderation-gateway.js';
import { ModerationWorker } from './infrastructure/moderation-worker.js';

/**
 * Consumidor da fila `moderation`, só no processo do worker. A fila é
 * alimentada pelo relay do outbox (`WorkerOutboxModule`).
 */
@Module({
  imports: [ResilienceModule.forRoot(), ListingRepositoryModule],
  providers: [
    ModerateListing,
    { provide: MODERATION_GATEWAY, useClass: HttpModerationGateway },
    ModerationWorker,
  ],
})
export class ModerationModule {}
