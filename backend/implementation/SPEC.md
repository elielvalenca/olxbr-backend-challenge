# Especificação

Serviço de inserção, listagem, detalhe e moderação assíncrona de anúncios. Enunciado em [`backend/README.md`](../README.md); decisões e alternativas descartadas em [`DECISIONS.md`](../../DECISIONS.md).

## Escopo

Orçamento de esforço do desafio: 4–6h. Prioridade para o essencial bem resolvido.

| Camada | Itens |
| --- | --- |
| **Essencial** | Criar/editar/detalhar/listar/arquivar anúncios, ciclo de status, moderação assíncrona (outbox + BullMQ, retry, backoff, circuit breaker, rate limit), JWT, Swagger, testes, Docker Compose |
| **Incluído além do essencial** | Projeção de leitura do detalhe no Redis; OpenTelemetry mínimo; painel da fila de moderação no Grafana |
| **Fora — documentar como evolução** | BFF com HMAC, projeção de leitura da listagem (ex.: materialized view), teste A/B sobre versões, Jaeger/Prometheus dedicados, DLQ com fila própria, SQS |

## Stack

- Node 22, NestJS, pnpm
- PostgreSQL + Drizzle (schema e migrations versionadas)
- Redis: BullMQ (filas) e projeção de leitura do detalhe
- JWT (sem cadastro de usuário)
- Swagger / OpenAPI
- OpenTelemetry mínimo + Grafana (painel da fila)
- Jest + Testcontainers (testes de integração)
- Docker + Docker Compose
- Arquitetura hexagonal pragmática (ver `AGENTS.md`)

Nota de produção: BullMQ seria provavelmente substituído por SQS. A escolha de ORM seria revisitada com uma RFC.

## Entidades

- `listings` — uma linha por **versão** do anúncio (append-only a partir do envio para revisão)
- `listing_images` — imagens (URLs) por versão
- `listing_audit_events` — trilha de transições de status
- `outbox_events` — eventos gravados na mesma transação das mudanças de status, consumidos pelas filas (ver "Fila")

Sem tabela de vendedor: o `sub` do JWT é gravado como `seller_id`.

## Versionamento (append-only)

- Identidade estável `listing_id` + `version` incremental.
- `draft` é editável no lugar (não gera versão).
- Editar uma versão `published` ou `rejected` cria uma **nova versão em `draft`** com os dados copiados. Versões `in_review` não são editáveis.
- Quando uma nova versão é publicada, a versão publicada anterior vai para `archived` pelo sistema. Enquanto a nova versão está em revisão, a anterior **continua publicada**.

## Status e ciclo de vida

| De | Para | Quem |
| --- | --- | --- |
| — | `draft` | usuário (criação) |
| `draft` | `in_review` | usuário (endpoint dedicado de envio) |
| `in_review` | `published` / `rejected` | moderação (worker) |
| `published` / `rejected` | nova versão `draft` | usuário (edição) |
| `published` | `archived` | sistema (nova versão publicada) |
| qualquer exceto `in_review` | `archived` | usuário |

- **`rejected`** é resultado de negócio, com `rejection_reason` visível. Falhas de integração nunca viram `rejected`.
- **Falha definitiva de integração** (retries esgotados ou `400`): o anúncio **permanece `in_review`**, a falha é registrada (audit + job falho no BullMQ) e há um script de reprocessamento.
- `published` entra direto após aprovação (sem etapas extras nesta versão).

## Visibilidade

| Endpoint | Público | Dono (JWT) |
| --- | --- | --- |
| Listagem | só `published` | — |
| Detalhe | `published` e `rejected` (com motivo) | todos os status das suas versões |
| Criar / editar / enviar / arquivar | — | sim |

## Validações (na criação e edição do draft)

- Título: `trim`, 10–100 caracteres.
- Preço: inteiro em **centavos** (`bigint`), > 0. A API recebe/expõe em centavos.
- Categoria: uma das 6 categorias do mock (`eletronicos`, `moveis`, `veiculos`, `imoveis`, `esportes`, `colecionaveis`).
- Descrição: obrigatória (limite a definir no DTO).
- Imagens: 1–10 URLs `https`. Assume-se que o cliente já fez o upload num bucket assinado e as URLs são confiáveis.
- **Sem validação de faixa de preço por categoria**: é regra da moderação (`price_out_of_range`); validar antes esconderia o motivo de negócio.

## Listagem

- Paginação `offset`/`limit` (limite máximo configurado), filtro por `category`, ordenação `published_at desc`.
- Lida do Postgres com índice parcial em `status = 'published'`.
- Cursor e projeção dedicada da listagem ficam como evolução.

## Projeção de leitura do detalhe (Redis)

- O payload do detalhe é **pré-computado e salvo pronto** no Redis por um job disparado pelos eventos do outbox (publicação, reprovação, arquivamento).
- O detalhe é lido sempre do Redis, com **timeout configurável** (env) e **fallback para o Postgres** em miss, erro ou timeout.
- Em miss, a API também enfileira uma reconstrução da projeção, **no máximo um pedido pendente por `listing_id`** (deduplicação do BullMQ por `listing_id`). A API nunca escreve no Redis: o projection worker é o único escritor.
- Detalhe do dono para `draft`/`in_review` vem do Postgres (não é projetado).

## Moderação assíncrona

Integração com o mock (`backend/api-mock`) tratada como serviço externo real. Comportamento observado no código do mock:

- Reprovação vem em `rejection_reason` (a doc diz `reason`): o adaptador aceita os dois.
- ~20% de `500`, limite de 5 req/s com `429` + `Retry-After`, latência de 100–2000 ms.
- `400` não é recuperável.

Requisitos do cliente: timeout, retry com backoff exponencial para erros transitórios, respeito ao `Retry-After`, circuit breaker (`opossum`), limitador global no worker (BullMQ `limiter`), processamento idempotente.

### Fila

```
API (1 transação) ─► listings + listing_audit_events + outbox_events
                                                        │
              dispatcher (worker) ── polling do outbox ─┤
                    ├─► fila `moderation`  ← listing.submitted
                    └─► fila `projection`  ← listing.published | listing.rejected | listing.archived

moderation worker: limiter 5/s · timeout · circuit breaker · retry
   └─► 1 transação: status + audit + outbox(listing.published | listing.rejected)
projection worker: monta o payload do detalhe a partir do Postgres → SET no Redis
```

**Outbox e despachante**

- `outbox_events` é gravada na mesma transação da mudança de status.
- O despachante roda como job repetível do BullMQ (~500 ms, configurável): `SELECT … WHERE dispatched_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100`, enfileira com `jobId = outbox.id` (o BullMQ ignora duplicados) e marca `dispatched_at`.
- Linhas despachadas são mantidas (histórico). **Sem limpeza nesta versão — débito técnico registrado.**

**Fila `moderation`**

- Job: `{ listingId, version }`. O worker relê a versão no Postgres e descarta o job se ela não estiver mais em `in_review` (idempotência).
- Timeout de 3 s por chamada (latência máxima do mock: 2 s).
- Classificação de erros: `5xx` e timeout → retry; `400` → falha imediata (não recuperável).
- Retry: 5 tentativas, backoff exponencial a partir de 1 s com jitter.
- `429` e circuito aberto → `worker.rateLimit(ms)` + `Worker.RateLimitError`: pausa o worker **sem consumir tentativa**, respeitando `Retry-After`.
- Circuit breaker (`opossum`): abre com 50% de erro numa janela de 10 s (mínimo de 5 chamadas), meia-abertura após 10 s.
- Limitador global do BullMQ: 5 jobs/s (compartilhado entre workers via Redis).
- Falha definitiva: anúncio permanece `in_review`, evento de auditoria de falha, job fica no set `failed` do BullMQ. Script de reprocessamento reenfileira os jobs falhos.
- Todos os valores acima configuráveis por variável de ambiente.

**Fila `projection`**

- Jobs vindos do outbox usam `jobId = outbox.id`; reconstruções por miss usam deduplicação por `listing_id`.
- O job reconstrói o payload a partir do estado atual no Postgres (não do conteúdo do evento) e grava no Redis; arquivamento remove a chave.
- Concorrência 1 no worker de projeção, para evitar escrita fora de ordem.

**Processos**

API e worker são processos separados, da mesma imagem e base de código, com dois entrypoints (`main.ts` e `worker.ts`) e dois serviços no Compose. O worker roda o despachante e as duas filas.

## Observabilidade

- OpenTelemetry mínimo: `tracing.ts` com SDK Node e auto-instrumentação (HTTP, Postgres, Redis), carregado antes do bootstrap da API e do worker. O NestJS não provê OTel nativamente.
- Exportação OTLP para o container `grafana/otel-lgtm` (coletor + Prometheus + Tempo + Grafana em um container, sem configuração própria).
- Métricas da fila de moderação: profundidade por estado (`getJobCounts`), jobs processados por resultado (aprovado / reprovado / falha), latência da chamada à moderação, estado do circuit breaker, eventos pendentes no outbox.
- Um painel no Grafana para a fila de moderação, provisionado por arquivo. Sem outros painéis por enquanto.

## Autenticação

JWT HS256. Tokens emitidos por script (sem cadastro). Leitura pública, escrita autenticada.

## Scripts

Via CLI do NestJS ou scripts `pnpm`: limpar ambiente, seed, gerar JWT, reprocessar jobs de moderação falhos.

## Seed

`backend/api-mock/seed/ads.json` traz 57 anúncios **sem imagens** e todos aprovariam na moderação.

- O script de seed cria cada anúncio como `draft` e o envia para revisão pelo fluxo real, exercitando a fila e alimentando o painel do Grafana.
- Imagem placeholder por anúncio: `https://picsum.photos/seed/<id>/800/600`.
- Preços convertidos de reais para centavos.

## Documentação

- `backend/implementation/README.md`: como rodar, arquitetura, contrato da API.
- `DECISIONS.md`, `AI_USAGE.md`, `AI_LOG.md` na raiz.

## OpenSpec

Usado para regras de negócio e novas capacidades. Não necessário para bugs e mudanças de infraestrutura (`chore`).
