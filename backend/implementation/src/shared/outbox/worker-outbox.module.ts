import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '@nestjs/outbox';
import type { Env } from '../config/env.js';
import { MODERATION_QUEUE, PROJECTION_QUEUE } from '../queue/queues.js';
import { redisConnection } from '../queue/redis-connection.js';
import { BullmqTransport } from './bullmq-transport.js';
import { outboxStoreProvider } from './outbox.module.js';

const queues = BullModule.registerQueue(
  { name: MODERATION_QUEUE },
  { name: PROJECTION_QUEUE },
);

/**
 * Outbox do lado do worker: o relay lê as mensagens do Postgres e as publica
 * na fila do tópico (`moderation` ou `projection`). Só roda no processo do worker.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    queues,
    OutboxModule.forRootAsync({
      imports: [queues],
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
  ],
  providers: [outboxStoreProvider],
})
export class WorkerOutboxModule {}
