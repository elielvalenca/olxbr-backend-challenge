import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CircuitOpenError,
  ResilienceService,
  ResilienceTimeoutError,
  type ResiliencePolicy,
} from '@nestjs/resilience';
import type { Env } from '../../../shared/config/env.js';
import { moderationCallDuration } from '../../../shared/observability/metrics.js';
import type { ListingContent } from '../../listings/application/listing-repository.js';
import {
  ModerationInvalidRequestError,
  ModerationTransientError,
  ModerationUnavailableError,
  type ModerationGateway,
  type ModerationVerdict,
} from '../application/moderation-gateway.js';

/** Espera usada quando o `429` vem sem um `Retry-After` legível. */
const DEFAULT_RETRY_AFTER_MS = 1000;

/** Só falha do serviço conta para o circuito: `400` e `429` não indicam serviço doente. */
const countsAsServiceFailure = (error: unknown): boolean =>
  error instanceof ModerationTransientError ||
  error instanceof ResilienceTimeoutError;

/**
 * Cliente do mock de moderação. Timeout e circuit breaker ficam numa política
 * do `@nestjs/resilience`; o retry fica por conta da fila (BullMQ), para não
 * multiplicar tentativas.
 */
@Injectable()
export class HttpModerationGateway implements ModerationGateway {
  private readonly url: string;
  private readonly policy: ResiliencePolicy;

  constructor(config: ConfigService<Env, true>, resilience: ResilienceService) {
    this.url = new URL(
      '/v1/moderation/check',
      config.get('MODERATION_API_URL', { infer: true }),
    ).href;
    const minimumCalls = config.get('MODERATION_BREAKER_MIN_CALLS', {
      infer: true,
    });
    this.policy = resilience.create(
      {
        retry: false,
        timeout: config.get('MODERATION_TIMEOUT_MS', { infer: true }),
        circuitBreaker: {
          name: 'moderation',
          failureRateThreshold: config.get('MODERATION_BREAKER_FAILURE_RATE', {
            infer: true,
          }),
          minimumCalls,
          // A janela precisa comportar o mínimo de chamadas (padrão do pacote: 20).
          slidingWindow: { type: 'count', size: Math.max(20, minimumCalls) },
          openDuration: config.get('MODERATION_BREAKER_OPEN_MS', {
            infer: true,
          }),
          recordIf: countsAsServiceFailure,
        },
      },
      'moderation',
    );
  }

  async check(content: ListingContent): Promise<ModerationVerdict> {
    const startedAt = performance.now();
    let outcome = 'ok';
    try {
      return await this.policy.execute((attempt) =>
        this.post(content, attempt.signal),
      );
    } catch (error) {
      outcome = 'error';
      if (error instanceof ResilienceTimeoutError) {
        throw new ModerationTransientError('Tempo limite da moderação');
      }
      if (error instanceof CircuitOpenError) {
        throw new ModerationUnavailableError(
          'Circuito da moderação aberto',
          error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS,
        );
      }
      throw error;
    } finally {
      moderationCallDuration.record(performance.now() - startedAt, { outcome });
    }
  }

  private async post(
    content: ListingContent,
    signal: AbortSignal,
  ): Promise<ModerationVerdict> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // O mock espera o preço em reais; guardamos centavos.
        body: JSON.stringify({
          title: content.title,
          description: content.description,
          price: content.priceCents / 100,
          category: content.category,
        }),
        signal,
      });
    } catch (error) {
      // Timeout: a política converte; aqui só falhas de rede viram transitórias.
      if (signal.aborted) throw error;
      throw new ModerationTransientError(`Falha de rede: ${String(error)}`);
    }
    return this.toVerdict(response);
  }

  private async toVerdict(response: Response): Promise<ModerationVerdict> {
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      throw new ModerationUnavailableError(
        'Moderação limitou a taxa (429)',
        Number.isFinite(seconds) && seconds > 0
          ? seconds * 1000
          : DEFAULT_RETRY_AFTER_MS,
      );
    }
    if (response.status === 400) {
      throw new ModerationInvalidRequestError(
        `Moderação recusou o payload (400): ${await response.text()}`,
      );
    }
    if (!response.ok) {
      throw new ModerationTransientError(
        `Moderação respondeu ${response.status}`,
      );
    }

    const body = (await response.json()) as {
      status?: string;
      rejection_reason?: string;
      reason?: string;
    };
    if (body.status === 'approved') return { status: 'approved' };
    if (body.status === 'rejected') {
      // A doc diz `reason`; o servidor real responde `rejection_reason`.
      return {
        status: 'rejected',
        reason: body.rejection_reason ?? body.reason ?? 'unknown',
      };
    }
    throw new ModerationTransientError(
      `Resposta inesperada da moderação: ${JSON.stringify(body)}`,
    );
  }
}
