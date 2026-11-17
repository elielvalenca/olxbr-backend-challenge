import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  NonRetryableMessageError,
  OutboxTransport,
  type OutboxMessage,
} from '@nestjs/outbox';
import type { JobsOptions, Queue } from 'bullmq';
import type { Env } from '../config/env.js';
import { MODERATION_QUEUE, PROJECTION_QUEUE } from '../queue/queues.js';
import {
  LISTING_ARCHIVED_TOPIC,
  LISTING_PUBLISHED_TOPIC,
  LISTING_SUBMITTED_TOPIC,
} from './topics.js';

/**
 * Publica as mensagens do outbox na fila BullMQ do tópico. O `jobId` é o id da
 * mensagem: republicar a mesma mensagem não duplica o job enquanto ele existir.
 * Jobs falhos ficam na fila (`removeOnFail: false`) para inspeção e reprocessamento.
 */
@Injectable()
export class BullmqTransport extends OutboxTransport {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue(MODERATION_QUEUE) moderation: Queue,
    @InjectQueue(PROJECTION_QUEUE) projection: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
    this.queues = {
      [LISTING_SUBMITTED_TOPIC]: moderation,
      [LISTING_PUBLISHED_TOPIC]: projection,
      [LISTING_ARCHIVED_TOPIC]: projection,
    };
  }

  async publish(message: OutboxMessage): Promise<void> {
    const queue = this.queues[message.topic];
    if (!queue) {
      throw new NonRetryableMessageError(
        `Tópico sem fila de destino: ${message.topic}`,
      );
    }
    await queue.add(message.topic, message.payload, {
      ...this.jobOptions(queue.name),
      jobId: message.id,
    });
  }

  private jobOptions(queueName: string): JobsOptions {
    const isModeration = queueName === MODERATION_QUEUE;
    return {
      attempts: isModeration
        ? this.config.get('MODERATION_ATTEMPTS', { infer: true })
        : PROJECTION_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: isModeration
          ? this.config.get('MODERATION_BACKOFF_MS', { infer: true })
          : PROJECTION_BACKOFF_MS,
        jitter: 0.5,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: false,
    };
  }
}

// A projeção só lê o Postgres e escreve no Redis: tentativas fixas bastam.
const PROJECTION_ATTEMPTS = 5;
const PROJECTION_BACKOFF_MS = 1000;
