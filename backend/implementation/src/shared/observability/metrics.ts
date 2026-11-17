import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('listings');

/** Resultado de cada job de moderação: `published`, `rejected`, `ignored` ou `failed` (falha definitiva). */
export const moderationJobs = meter.createCounter('moderation.jobs', {
  description: 'Jobs de moderação concluídos, por resultado',
});

/** Duração da chamada ao serviço de moderação, com `outcome` = `ok` ou `error`. */
export const moderationCallDuration = meter.createHistogram(
  'moderation.call.duration',
  { unit: 'ms', description: 'Latência da chamada à moderação' },
);

export { meter };
