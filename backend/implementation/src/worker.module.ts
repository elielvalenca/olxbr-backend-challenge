import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module.js';
import { ProjectionModule } from './modules/projection/projection.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { WorkerMetricsModule } from './shared/observability/worker-metrics.module.js';
import { WorkerOutboxModule } from './shared/outbox/worker-outbox.module.js';

/**
 * Módulo raiz do worker: relay do outbox e consumidores das filas
 * (`moderation` e `projection`). Sem servidor HTTP.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    WorkerOutboxModule,
    ModerationModule,
    ProjectionModule,
    WorkerMetricsModule,
  ],
})
export class WorkerModule {}
