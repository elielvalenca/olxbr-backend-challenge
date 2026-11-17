import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '@nestjs/outbox';
import { ResilienceModule } from '@nestjs/resilience';
import type { Env } from '../../shared/config/env.js';
import { redisConnection } from '../../shared/queue/redis-connection.js';
import { outboxStoreProvider } from '../../shared/outbox/outbox.module.js';
import { ListingRepositoryModule } from '../listings/listing-repository.module.js';
import { ModerateListing } from './application/moderate-listing.js';
import { MODERATION_GATEWAY } from './application/moderation-gateway.js';
import { BullmqTransport } from './infrastructure/bullmq-transport.js';
import { HttpModerationGateway } from './infrastructure/http-moderation-gateway.js';
import { MODERATION_QUEUE } from './infrastructure/moderation-queue.js';
import { ModerationWorker } from './infrastructure/moderation-worker.js';

const moderationQueue = BullModule.registerQueue({ name: MODERATION_QUEUE });

/**
 * Pipeline de moderação, só no processo do worker: relay do outbox → fila
 * `moderation` → consumidor que chama o serviço externo.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    moderationQueue,
    ResilienceModule.forRoot(),
    OutboxModule.forRootAsync({
      imports: [moderationQueue],
      transports: { bullmq: BullmqTransport },
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        route: () => 'bullmq',
        relay: {
          enabled: true,
          pollInterval: config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }),
        },
      }),
    }),
    ListingRepositoryModule,
  ],
  providers: [
    outboxStoreProvider,
    ModerateListing,
    { provide: MODERATION_GATEWAY, useClass: HttpModerationGateway },
    ModerationWorker,
  ],
})
export class ModerationModule {}
