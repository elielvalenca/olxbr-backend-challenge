import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.js';

/**
 * Conexão com o Postgres, compartilhada pela API e pelo worker.
 * O pool é fechado no shutdown da aplicação pelo próprio `DrizzleModule`.
 */
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
  ],
})
export class DatabaseModule {}
