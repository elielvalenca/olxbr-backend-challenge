import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PROJECTION_QUEUE } from '../../../shared/queue/queues.js';
import type { ProjectionRebuildRequester } from '../application/public-detail-cache.js';

@Injectable()
export class BullmqRebuildRequester implements ProjectionRebuildRequester {
  constructor(@InjectQueue(PROJECTION_QUEUE) private readonly queue: Queue) {}

  /**
   * `jobId` fixo por anúncio: enquanto o job existe, novos pedidos não o
   * duplicam. Ele é removido ao terminar, então um miss posterior reenfileira.
   */
  async request(listingId: string): Promise<void> {
    await this.queue.add(
      'rebuild',
      { listingId },
      {
        jobId: `rebuild-${listingId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
