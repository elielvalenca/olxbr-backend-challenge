import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * OpenTelemetry mínimo, carregado antes de tudo no `main.ts` e no `worker.ts`
 * (a instrumentação precisa existir antes dos módulos que ela intercepta).
 * Só liga se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido; sem ele, as
 * métricas do código viram no-op. Endpoint e nome do serviço vêm das variáveis
 * padrão `OTEL_*`. A instrumentação do NestJS ainda não suporta o v12, então só
 * HTTP, Postgres e Redis são instrumentados.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 5000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
