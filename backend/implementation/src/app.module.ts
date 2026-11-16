import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { AppConfigModule } from './shared/config/config.module.js';

/** Módulo raiz da API HTTP. */
@Module({
  imports: [AppConfigModule],
  controllers: [HealthController],
})
export class AppModule {}
