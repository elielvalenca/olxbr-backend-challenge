import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { AppConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';

/** Módulo raiz da API HTTP. */
@Module({
  imports: [AppConfigModule, DatabaseModule, ListingsModule],
  controllers: [HealthController],
})
export class AppModule {}
