import { Queue } from 'bullmq';
import { validateEnv } from '../shared/config/env.js';
import { redisConnection } from '../shared/queue/redis-connection.js';
import { MODERATION_QUEUE } from '../shared/queue/queues.js';
import { reprocessFailedModerations } from '../modules/moderation/infrastructure/reprocess-failed.js';

/** Reenfileira as moderações que falharam definitivamente (rode com o worker ligado). */
async function main(): Promise<void> {
  const { REDIS_URL } = validateEnv(process.env);
  const queue = new Queue(MODERATION_QUEUE, {
    connection: redisConnection(REDIS_URL),
  });
  try {
    const count = await reprocessFailedModerations(queue);
    console.log(`${count} job(s) de moderação reenfileirado(s)`);
  } finally {
    await queue.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
