import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.js';
import { PROJECTION_QUEUE } from '../../shared/queue/queues.js';
import { redisConnection } from '../../shared/queue/redis-connection.js';
import { PROJECTION_REBUILD_REQUESTER } from './application/public-detail-cache.js';
import { BullmqRebuildRequester } from './infrastructure/bullmq-rebuild-requester.js';

/** Lado da API: só enfileira pedidos de reconstrução; quem consome é o worker. */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    BullModule.registerQueue({ name: PROJECTION_QUEUE }),
  ],
  providers: [
    {
      provide: PROJECTION_REBUILD_REQUESTER,
      useClass: BullmqRebuildRequester,
    },
  ],
  exports: [PROJECTION_REBUILD_REQUESTER],
})
export class ProjectionRequestsModule {}
