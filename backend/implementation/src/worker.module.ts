import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';

/**
 * Módulo raiz do worker: relay do outbox e consumidores das filas
 * `moderation` e `projection` (a implementar). Sem servidor HTTP.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule],
})
export class WorkerModule {}
