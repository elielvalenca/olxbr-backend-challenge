import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MODERATION_QUEUE, PROJECTION_QUEUE } from '../queue/queues.js';
import { WorkerMetrics } from './worker-metrics.js';

/**
 * Métricas de estado do worker (filas, outbox, circuit breaker). Usa o
 * `ResilienceModule` global registrado pelo `ModerationModule`.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: MODERATION_QUEUE },
      { name: PROJECTION_QUEUE },
    ),
  ],
  providers: [WorkerMetrics],
})
export class WorkerMetricsModule {}
