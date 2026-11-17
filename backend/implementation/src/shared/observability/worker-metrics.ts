import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OutboxRelay } from '@nestjs/outbox';
import { ResilienceEvents } from '@nestjs/resilience';
import type { Queue } from 'bullmq';
import { MODERATION_QUEUE, PROJECTION_QUEUE } from '../queue/queues.js';
import { meter } from './metrics.js';

const BREAKER_STATE = { closed: 0, 'half-open': 1, open: 2 } as const;

/**
 * Métricas de estado do worker, lidas na hora da coleta: profundidade das
 * filas por estado, pendências e atraso do outbox e estado do circuit breaker
 * da moderação (0 fechado, 1 meio-aberto, 2 aberto).
 */
@Injectable()
export class WorkerMetrics implements OnModuleInit {
  private breaker: number = BREAKER_STATE.closed;

  constructor(
    @InjectQueue(MODERATION_QUEUE) private readonly moderation: Queue,
    @InjectQueue(PROJECTION_QUEUE) private readonly projection: Queue,
    private readonly relay: OutboxRelay,
    private readonly resilience: ResilienceEvents,
  ) {}

  onModuleInit(): void {
    meter
      .createObservableGauge('queue.jobs', {
        description: 'Jobs por fila e estado',
      })
      .addCallback(async (result) => {
        for (const queue of [this.moderation, this.projection]) {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
          );
          for (const [state, value] of Object.entries(counts)) {
            result.observe(value, { queue: queue.name, state });
          }
        }
      });

    const outboxPending = meter.createObservableGauge('outbox.pending', {
      description: 'Mensagens do outbox ainda não publicadas',
    });
    const outboxLag = meter.createObservableGauge('outbox.lag', {
      unit: 'ms',
      description: 'Há quanto tempo a mensagem mais antiga espera',
    });
    meter.addBatchObservableCallback(
      async (result) => {
        const stats = await this.relay.stats();
        result.observe(outboxPending, stats.pending);
        result.observe(outboxLag, stats.lagMs);
      },
      [outboxPending, outboxLag],
    );

    meter
      .createObservableGauge('moderation.circuit.state', {
        description:
          'Circuit breaker da moderação: 0 fechado, 1 meio-aberto, 2 aberto',
      })
      .addCallback((result) => result.observe(this.breaker));
    this.resilience.events$.subscribe((event) => {
      if (event.policy !== 'moderation') return;
      if (event.type === 'circuit-open') this.breaker = BREAKER_STATE.open;
      if (event.type === 'circuit-half-open') {
        this.breaker = BREAKER_STATE['half-open'];
      }
      if (event.type === 'circuit-closed') this.breaker = BREAKER_STATE.closed;
    });
  }
}
