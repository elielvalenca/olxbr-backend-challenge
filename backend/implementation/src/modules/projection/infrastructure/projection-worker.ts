import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Env } from '../../../shared/config/env.js';
import { PROJECTION_QUEUE } from '../../../shared/queue/queues.js';
import { redisConnection } from '../../../shared/queue/redis-connection.js';
import { ProjectListing } from '../application/project-listing.js';

/**
 * Consumidor da fila `projection`: mensagens do outbox e pedidos de
 * reconstrução têm o mesmo formato (`{ listingId }`) e o mesmo tratamento.
 * Concorrência 1: o único escritor da projeção não corre contra si mesmo.
 */
@Injectable()
export class ProjectionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ProjectionWorker.name);
  private worker?: Worker<{ listingId?: unknown }>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly projectListing: ProjectListing,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(PROJECTION_QUEUE, (job) => this.process(job), {
      connection: redisConnection(
        this.config.get('REDIS_URL', { infer: true }),
      ),
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.error(
        `Projeção falhou: ${job?.name} ${job?.id}: ${error.message}`,
      ),
    );
    this.worker.on('error', (error) => this.logger.error(error));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<{ listingId?: unknown }>): Promise<void> {
    const { listingId } = job.data;
    if (typeof listingId !== 'string') {
      throw new UnrecoverableError('Job de projeção sem listingId');
    }
    await this.projectListing.execute(listingId);
  }
}
