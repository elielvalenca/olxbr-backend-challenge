import type { ConfigService } from '@nestjs/config';
import { NonRetryableMessageError, type OutboxMessage } from '@nestjs/outbox';
import type { Queue } from 'bullmq';
import type { Env } from '../config/env.js';
import { BullmqTransport } from './bullmq-transport.js';

const fakeQueue = (name: string) =>
  ({ name, add: vi.fn().mockResolvedValue(undefined) }) as unknown as Queue & {
    add: ReturnType<typeof vi.fn>;
  };

const config = {
  get: (key: string) =>
    ({ MODERATION_ATTEMPTS: 3, MODERATION_BACKOFF_MS: 500 })[key],
} as unknown as ConfigService<Env, true>;

const message = (topic: string): OutboxMessage =>
  ({ id: 'msg-1', topic, payload: { listingId: 'l1' } }) as OutboxMessage;

describe('BullmqTransport', () => {
  const moderation = fakeQueue('moderation');
  const projection = fakeQueue('projection');
  const transport = new BullmqTransport(moderation, projection, config);

  beforeEach(() => {
    moderation.add.mockClear();
    projection.add.mockClear();
  });

  it('listing.submitted vai para a fila de moderação, com a configuração dela', async () => {
    await transport.publish(message('listing.submitted'));

    expect(projection.add).not.toHaveBeenCalled();
    expect(moderation.add).toHaveBeenCalledWith(
      'listing.submitted',
      { listingId: 'l1' },
      expect.objectContaining({
        jobId: 'msg-1',
        attempts: 3,
        backoff: expect.objectContaining({ delay: 500 }),
        removeOnFail: false,
      }),
    );
  });

  it.each(['listing.published', 'listing.archived'])(
    '%s vai para a fila de projeção, com o id da mensagem como jobId',
    async (topic) => {
      await transport.publish(message(topic));

      expect(moderation.add).not.toHaveBeenCalled();
      expect(projection.add).toHaveBeenCalledWith(
        topic,
        { listingId: 'l1' },
        expect.objectContaining({ jobId: 'msg-1', attempts: 5 }),
      );
    },
  );

  it('tópico desconhecido não é retentável', async () => {
    await expect(
      transport.publish(message('listing.outro')),
    ).rejects.toBeInstanceOf(NonRetryableMessageError);
  });
});
