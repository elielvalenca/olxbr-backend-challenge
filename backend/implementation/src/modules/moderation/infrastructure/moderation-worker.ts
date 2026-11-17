import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Env } from '../../../shared/config/env.js';
import { moderationJobs } from '../../../shared/observability/metrics.js';
import { redisConnection } from '../../../shared/queue/redis-connection.js';
import {
  LISTING_REPOSITORY,
  type ListingRepository,
  type VersionRef,
} from '../../listings/application/listing-repository.js';
import { ModerateListing } from '../application/moderate-listing.js';
import {
  ModerationInvalidRequestError,
  ModerationUnavailableError,
} from '../application/moderation-gateway.js';
import { MODERATION_QUEUE } from '../../../shared/queue/queues.js';

/**
 * Consumidor da fila `moderation`. O `Worker` é criado aqui (e não com
 * `@Processor`) porque limite por segundo e concorrência vêm da configuração
 * validada, que um decorator estático não alcança.
 */
@Injectable()
export class ModerationWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ModerationWorker.name);
  private worker?: Worker<VersionRef>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly moderate: ModerateListing,
    @Inject(LISTING_REPOSITORY) private readonly repository: ListingRepository,
  ) {}

  onApplicationBootstrap(): void {
    const worker = new Worker<VersionRef>(
      MODERATION_QUEUE,
      (job) => this.process(job),
      {
        connection: redisConnection(
          this.config.get('REDIS_URL', { infer: true }),
        ),
        concurrency: this.config.get('MODERATION_CONCURRENCY', { infer: true }),
        // Limite global (via Redis), somado entre todos os workers.
        limiter: {
          max: this.config.get('MODERATION_RATE_LIMIT_PER_SECOND', {
            infer: true,
          }),
          duration: 1000,
        },
      },
    );
    worker.on('failed', (job, error) => void this.onFailed(job, error));
    worker.on('error', (error) => this.logger.error(error));
    this.worker = worker;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  /** Traduz os erros do adaptador nas ações do BullMQ (pausar, não repetir, repetir). */
  private async process(job: Job<VersionRef>): Promise<void> {
    const { listingId, version } = job.data;
    try {
      const outcome = await this.moderate.execute({ listingId, version });
      moderationJobs.add(1, { result: outcome });
    } catch (error) {
      if (error instanceof ModerationUnavailableError) {
        // Pausa o worker e devolve o job à fila sem gastar tentativa.
        await this.worker?.rateLimit(error.retryAfterMs);
        throw Worker.RateLimitError();
      }
      if (error instanceof ModerationInvalidRequestError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  /** Falha definitiva (tentativas esgotadas ou irrecuperável): fica `in_review` e é auditada. */
  private async onFailed(job: Job<VersionRef> | undefined, error: Error) {
    if (!job) return;
    const exhausted =
      error instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) return;
    const { listingId, version } = job.data;
    moderationJobs.add(1, { result: 'failed' });
    this.logger.error(
      `Moderação falhou de vez: ${listingId} v${version}: ${error.message}`,
    );
    try {
      await this.repository.recordModerationFailure(
        { listingId, version },
        { error: error.message, attempts: job.attemptsMade },
      );
    } catch (auditError) {
      this.logger.error(auditError);
    }
  }
}
