import { Module } from '@nestjs/common';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore, fromDrizzle } from '@nestjs/outbox/postgres';
import { DATABASE, type Database } from '../database/database.js';

/**
 * Outbox transacional sobre o Postgres do projeto. O relay fica desligado: a
 * API só grava mensagens (`outbox.add(tx, …)`); quem as publica é o worker.
 * O schema `nest_outbox` vem das migrations do Drizzle (`migrate: false`).
 */
@Module({
  imports: [OutboxModule.forRoot({ relay: { enabled: false } })],
  providers: [
    {
      provide: PostgresOutboxStore,
      inject: [DATABASE, OutboxStorage],
      useFactory: (db: Database, storage: OutboxStorage) =>
        new PostgresOutboxStore(
          { executor: fromDrizzle(db), migrate: false },
          storage,
        ),
    },
  ],
})
export class ApiOutboxModule {}
