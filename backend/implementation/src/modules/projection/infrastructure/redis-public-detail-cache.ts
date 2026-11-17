import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ListingDetail } from '../../listings/application/listing-queries.js';
import type { PublicDetailCache } from '../application/public-detail-cache.js';

const keyOf = (listingId: string) => `listing:detail:${listingId}`;

/** Payload do detalhe como JSON, com validade; as datas voltam como `Date` na leitura. */
@Injectable()
export class RedisPublicDetailCache
  implements PublicDetailCache, OnApplicationShutdown
{
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async get(listingId: string): Promise<ListingDetail | null> {
    const raw = await this.redis.get(keyOf(listingId));
    if (raw === null) return null;
    const stored = JSON.parse(raw) as Omit<ListingDetail, 'publishedAt'> & {
      publishedAt: string | null;
    };
    return {
      ...stored,
      publishedAt: stored.publishedAt ? new Date(stored.publishedAt) : null,
    };
  }

  async set(detail: ListingDetail): Promise<void> {
    await this.redis.set(
      keyOf(detail.listingId),
      JSON.stringify(detail),
      'EX',
      this.ttlSeconds,
    );
  }

  async remove(listingId: string): Promise<void> {
    await this.redis.del(keyOf(listingId));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
