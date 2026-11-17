import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { AppConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';

/** Módulo raiz da API HTTP. */
@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
