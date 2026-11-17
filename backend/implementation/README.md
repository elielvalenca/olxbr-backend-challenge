# Marketplace Listings — implementação

Serviço de inserção, listagem, detalhe e moderação assíncrona de anúncios.

> Em construção. Especificação em [`SPEC.md`](SPEC.md); decisões em [`../../DECISIONS.md`](../../DECISIONS.md); planejamento por changes em [`../../openspec/`](../../openspec/).

## Como rodar

Requisitos: Node 22 (`nvm use`), pnpm e Docker.

```bash
cp .env.example .env
docker compose up -d --wait   # Postgres, Redis, mock da moderação e Grafana/OTel
pnpm install
pnpm db:migrate               # aplica as migrations
pnpm start:dev                # API em http://localhost:3000 (Swagger em /docs)
pnpm start:worker:dev         # worker (processo separado, mesma base de código)
```

## Banco de dados

| Comando | O que faz |
| --- | --- |
| `pnpm db:migrate` | Aplica as migrations pendentes (idempotente) |
| `pnpm db:reset` | Apaga tudo e reaplica as migrations. Recusa rodar com `NODE_ENV=production` |
| `pnpm db:generate` | Gera uma migration a partir do schema em `src/modules/listings/infrastructure/schema.ts` |

As migrations ficam em `drizzle/` e são o **único histórico**: a `0001_outbox.sql` contém o SQL do `@nestjs/outbox` (schema `nest_outbox`), e o store do outbox roda com `migrate: false`. Ao atualizar o pacote, gere uma nova migration em vez de editar a existente.

### Modelo de dados

Um anúncio é guardado em **versões append-only**. `listing_id` é compartilhado pelas versões e não tem tabela própria.

```
listings                    PK (listing_id, version)
  status: draft | in_review | rejected | published | archived
  price_cents (bigint > 0)
  UNIQUE (listing_id) WHERE status = 'published'              -- uma versão publicada
  UNIQUE (listing_id) WHERE status IN ('draft','in_review')   -- uma versão aberta
        |
        |-- listing_images          PK (listing_id, version, position)
        |                           copiadas ao criar uma nova versão
        `-- listing_audit_events    um evento por transição (escrito pela aplicação)
                                    actor, reason, metadata jsonb
```

- **O banco garante as invariantes de unicidade.** A unicidade não depende de locks da aplicação: uma corrida vira `unique_violation`, traduzida em `ListingVersionConflictError`. Como o índice parcial não é adiável, publicar uma versão **arquiva a anterior antes** de publicar a nova, na mesma transação (`ListingRepository.publishReplacing`).
- **Limites de negócio ficam na aplicação**, não no banco: tamanho do título, categorias válidas e número máximo de imagens são ajustáveis por configuração, sem migration.
- Decisões e alternativas: D14 e D15 em [`DECISIONS.md`](../../DECISIONS.md).

## Testes

| Comando | O que roda |
| --- | --- |
| `pnpm test` | Unitários (`*.spec.ts`) |
| `pnpm test:e2e` | HTTP com o app Nest (`test/*.e2e-spec.ts`) |
| `pnpm test:int` | Integração com Postgres real via Testcontainers (`*.int-spec.ts`); exige Docker |

## Outros comandos

`pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`, `pnpm format` (Prettier).
