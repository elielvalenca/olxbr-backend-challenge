import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { DatabaseModule } from './shared/database/database.module.js';

/**
 * Módulo raiz do worker: relay do outbox e consumidores das filas
 * (`moderation` já; `projection` a implementar). Sem servidor HTTP.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, ModerationModule],
})
export class WorkerModule {}
