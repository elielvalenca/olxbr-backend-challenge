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

## Autenticação

JWT HS256, sem cadastro: o `sub` do token é o `seller_id`. Defina `JWT_SECRET` no `.env` (mínimo 32 caracteres; a aplicação não sobe sem ele) e emita um token:

```bash
pnpm auth:token seller-1                      # expira em 24h
pnpm auth:token seller-1 --expires-in 1h
```

Use-o como `Authorization: Bearer <token>`. Token ausente, inválido, expirado ou com outro algoritmo responde `401`.

## API de escrita

Todos os endpoints exigem token e estão no Swagger (`/docs`). A resposta de sucesso é sempre `{ listingId, version, status }`.

| Método e rota | O que faz | Erros |
| --- | --- | --- |
| `POST /listings` | Cria o anúncio (versão 1, `draft`) — `201` | `400` |
| `PATCH /listings/:listingId` | Edita (parcial). `draft`: no lugar. `published`/`rejected`: cria nova versão `draft` a partir da versão mais recente | `400` `404` `409` |
| `POST /listings/:listingId/submit` | `draft` → `in_review` e grava a mensagem `listing.submitted` no outbox | `404` `409` |
| `POST /listings/:listingId/archive` | Arquiva todas as versões não arquivadas | `404` `409` |

Corpo de criação (e, parcialmente, de edição):

```json
{
  "title": "Bicicleta aro 29 seminova",
  "description": "Pouco uso, revisada.",
  "priceCents": 150000,
  "category": "esportes",
  "imageUrls": ["https://cdn.example.com/a.jpg"]
}
```

- Título 10–100 caracteres (após `trim`); descrição obrigatória (até 5000); preço inteiro em centavos > 0; categoria entre `eletronicos`, `moveis`, `veiculos`, `imoveis`, `esportes`, `colecionaveis`; 1–10 imagens `https`. Violações respondem `400` com `errors: [{ field, message }]`. Faixa de preço por categoria é da moderação, não é validada aqui.
- `404` vale também para anúncio de **outro vendedor** (não se revela que ele existe).
- `409`: transição inválida (ex.: enviar quem não é rascunho), edição de versão `in_review` ou `archived`, arquivar com versão `in_review` e edição concorrente.
- A edição parte sempre da **versão mais recente**, mesmo `rejected` (D16). Uma versão em `draft` só vai para a moderação no `submit`.

## API de leitura

| Método e rota | O que faz | Erros |
| --- | --- | --- |
| `GET /listings` | **Pública.** Lista anúncios `published`, mais recentes primeiro | `400` |
| `GET /listings/:listingId` | **Pública.** Detalhe da versão `published`. Ignora `Authorization` | `404` |
| `GET /me/listings/:listingId` | **Autenticada.** Detalhe do dono: versão mais recente em qualquer status, com `rejectionReason` se `rejected` | `401` `404` |

- Query da listagem: `offset` (padrão 0), `limit` (padrão `LISTINGS_DEFAULT_PAGE_SIZE`=20, máximo `LISTINGS_MAX_PAGE_SIZE`=50; acima disso `400`) e `category`. Resposta: `{ items, total, offset, limit }`, com `total` refletindo o filtro. Itens: `listingId`, `title`, `priceCents`, `category`, `publishedAt`, `coverImageUrl`.
- O detalhe público responde `404` para tudo que não tem versão `published` (rascunho, em revisão, reprovado, arquivado, inexistente ou id que não é UUID), mesmo que exista uma versão mais nova em revisão: o público continua vendo a publicada. Reprovações e motivos só aparecem para o dono (D18).
- `GET /me/listings/:listingId` responde `404` também para anúncio de outro vendedor.
- `sellerId` nunca é exposto.

## Moderação assíncrona

`submit` grava `listing.submitted` no outbox. O worker publica a mensagem na fila BullMQ `moderation` (relay do `@nestjs/outbox`), chama o mock e aplica o resultado em uma transação: `published` (arquivando a versão publicada anterior) ou `rejected` com `rejection_reason`.

- **Idempotente:** se a versão já não está `in_review`, o job é descartado sem alterar nada.
- **Falhas transitórias** (`5xx`, timeout, rede): retry com backoff exponencial e jitter (BullMQ). `429` e circuito aberto pausam o worker sem gastar tentativa; `400` falha na hora.
- **Falha definitiva nunca vira `rejected`:** a versão permanece `in_review`, a auditoria ganha um evento `moderation_failed` e o job fica no set `failed`. Depois de resolver a causa: `pnpm moderation:reprocess` (com o Redis acima).
- Limite global de 5 jobs/s (Redis), timeout e circuit breaker configuráveis por variáveis `MODERATION_*` (ver `.env.example`). O estado do breaker é por processo do worker.

## Projeção do detalhe público

`GET /listings/:listingId` lê primeiro do Redis (`listing:detail:<listingId>`, JSON do mesmo detalhe) e cai para o Postgres em miss, erro ou tempo limite (`DETAIL_CACHE_TIMEOUT_MS`); uma falha do Redis nunca vira erro na resposta.

- **Quem escreve:** só o worker. Publicar e arquivar gravam `listing.published`/`listing.archived` no outbox, na mesma transação; o relay as entrega à fila `projection`, e o job relê o Postgres e faz `SET` (ou `DEL`, se não há versão publicada). Reprovar não gera evento.
- **Miss:** a API lê do banco e, se o anúncio existe publicado, enfileira uma reconstrução (no máximo uma pendente por anúncio, sem atrasar a resposta). Anúncio sem versão publicada responde `404` sem enfileirar nada.
- **Consistência eventual:** após publicar uma nova versão ou arquivar, o público pode ver o estado antigo até o relay (`OUTBOX_POLL_INTERVAL_MS`) e o worker rodarem.
- **Validade:** `DETAIL_CACHE_TTL_SECONDS` (padrão 24 h). O Redis roda com `noeviction` (exigência do BullMQ), então a validade limita a memória e corrige uma mensagem perdida.
- O detalhe do dono (`/me/listings/:id`) e a listagem não passam pela projeção.

## Testes

| Comando | O que roda |
| --- | --- |
| `pnpm test` | Unitários (`*.spec.ts`) |
| `pnpm test:e2e` | HTTP com o app Nest (`test/*.e2e-spec.ts`); usa o Postgres do Compose, com `pnpm db:migrate` já aplicado |
| `pnpm test:int` | Integração com Postgres real via Testcontainers (`*.int-spec.ts`); exige Docker |

## Outros comandos

`pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`, `pnpm format` (Prettier).
