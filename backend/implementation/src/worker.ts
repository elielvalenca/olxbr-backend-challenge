import './tracing.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

// Processo separado da API (mesma imagem): roda o relay do outbox e os consumidores das filas.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker iniciado', 'Bootstrap');
}

await bootstrap();
