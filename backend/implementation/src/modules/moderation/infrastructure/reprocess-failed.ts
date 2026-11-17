import type { Queue } from 'bullmq';

/**
 * Reenfileira os jobs que falharam definitivamente, com as tentativas zeradas.
 * Seguro repetir: o caso de uso ignora versões que já não estão `in_review`.
 */
export async function reprocessFailedModerations(
  queue: Queue,
): Promise<number> {
  const failed = await queue.getFailed();
  for (const job of failed) {
    await job.retry('failed', { resetAttemptsMade: true });
  }
  return failed.length;
}
