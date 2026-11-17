import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  NonRetryableMessageError,
  OutboxTransport,
  type OutboxMessage,
} from '@nestjs/outbox';
import type { Queue } from 'bullmq';
import type { Env } from '../../../shared/config/env.js';
import {
  LISTING_SUBMITTED_TOPIC,
  MODERATION_QUEUE,
} from './moderation-queue.js';

/**
 * Publica as mensagens do outbox na fila BullMQ. O `jobId` é o id da mensagem:
 * republicar a mesma mensagem não duplica o job enquanto ele existir.
 * Jobs falhos ficam na fila (`removeOnFail: false`) para o reprocessamento.
 */
@Injectable()
export class BullmqTransport extends OutboxTransport {
  constructor(
    @InjectQueue(MODERATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async publish(message: OutboxMessage): Promise<void> {
    if (message.topic !== LISTING_SUBMITTED_TOPIC) {
      throw new NonRetryableMessageError(
        `Tópico sem fila de destino: ${message.topic}`,
      );
    }
    await this.queue.add(message.topic, message.payload, {
      jobId: message.id,
      attempts: this.config.get('MODERATION_ATTEMPTS', { infer: true }),
      backoff: {
        type: 'exponential',
        delay: this.config.get('MODERATION_BACKOFF_MS', { infer: true }),
        jitter: 0.5,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: false,
    });
  }
}
