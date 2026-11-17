import { Test } from '@nestjs/testing';
import { Outbox } from '@nestjs/outbox';
import type { Transaction } from '../../src/shared/database/database.js';
import { DATABASE, type Database } from '../../src/shared/database/database.js';
import { ApiOutboxModule } from '../../src/shared/outbox/outbox.module.js';
import { Global, Module } from '@nestjs/common';

/** Outbox real (store Postgres, relay desligado) sobre o banco de teste. */
export async function createTestOutbox(db: Database) {
  @Global()
  @Module({
    providers: [{ provide: DATABASE, useValue: db }],
    exports: [DATABASE],
  })
  class TestDatabaseModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestDatabaseModule, ApiOutboxModule],
  }).compile();
  await moduleRef.init();
  return {
    outbox: moduleRef.get<Outbox<Transaction>>(Outbox),
    close: () => moduleRef.close(),
  };
}
