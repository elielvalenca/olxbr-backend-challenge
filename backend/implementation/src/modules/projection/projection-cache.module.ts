import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../shared/config/env.js';
import { PUBLIC_DETAIL_CACHE } from './application/public-detail-cache.js';
import { RedisPublicDetailCache } from './infrastructure/redis-public-detail-cache.js';

/**
 * Cache da projeção do detalhe (Redis), usado pela API (leitura) e pelo
 * worker (escrita). Com `enableOfflineQueue: false` e `commandTimeout`, um
 * Redis fora do ar ou lento falha na hora e a leitura cai para o Postgres,
 * em vez de empilhar comandos.
 */
@Module({
  providers: [
    {
      provide: PUBLIC_DETAIL_CACHE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
          commandTimeout: config.get('DETAIL_CACHE_TIMEOUT_MS', {
            infer: true,
          }),
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        // Sem listener, um erro de conexão derrubaria o processo; a falha aparece em cada comando.
        redis.on('error', () => undefined);
        return new RedisPublicDetailCache(
          redis,
          config.get('DETAIL_CACHE_TTL_SECONDS', { infer: true }),
        );
      },
    },
  ],
  exports: [PUBLIC_DETAIL_CACHE],
})
export class ProjectionCacheModule {}
