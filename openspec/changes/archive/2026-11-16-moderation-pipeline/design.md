# Design

## Context

O envio para revisão já grava `listing.submitted` no outbox na mesma transação (`listing-lifecycle`), mas ninguém publica a mensagem nem modera. O `WorkerModule` existe vazio. Motivação e escopo em `proposal.md`; comportamento em `specs/`. Contrato do mock em `AGENTS.md` (o código do mock é a fonte da verdade).

## Goals / Non-Goals

**Goals:**
- Fechar o caminho `in_review` → `published`/`rejected` de ponta a ponta, tolerando as falhas do mock.
- Manter o domínio e o caso de uso sem NestJS/BullMQ/HTTP; a infraestrutura fica nos adaptadores.

**Non-Goals:**
- Fila `projection` e mensagens `listing.published`/`listing.rejected` no outbox: entram em `detail-projection`, que também as grava nas transições.
- Métricas e painel (observabilidade é outra change).
- DLQ com fila própria: o set `failed` do BullMQ cumpre o papel (SPEC).

## Decisions

**Estrutura.** `src/modules/moderation/` com `application/` (caso de uso `ModerateListing` e a porta `ModerationGateway`), `infrastructure/` (adaptador HTTP, transport do outbox, worker BullMQ) e o módulo. O caso de uso usa o `ListingRepository` existente: moderação não ganha repositório próprio.

**Resultado atômico e idempotente no repositório.** `TransitionDetails` ganha `expectedFrom?`; `applyTransition` já valida o status sob `FOR UPDATE`. A moderação passa `expectedFrom: 'in_review'` em `publishReplacing` e `transition`: se outro processamento ganhou, lança `ListingVersionConflictError`, a transação inteira (inclusive o arquivamento da versão anterior) é desfeita e o caso de uso descarta o job. Alternativa descartada: ler o status antes e decidir fora da transação, que deixa janela de corrida. O caso de uso também faz uma leitura inicial só para evitar chamar o mock à toa.

**Leitura da versão.** Novo `findVersion(ref)` no repositório (a moderação precisa de uma versão específica, não da mais recente: uma nova versão `draft` pode já existir).

**Falha registrada no repositório.** `recordModerationFailure(ref, error)` insere um evento `in_review` → `in_review` com `reason = 'moderation_failed'` e o erro/tentativas em `metadata`, sem mudar o status. Alternativa descartada: novo status ou tabela de falhas; o evento de auditoria já é a trilha.

**Adaptador do mock.** `fetch` com `AbortSignal` e `ResilienceService.create({ timeout, circuitBreaker, retry: false }, 'moderation')` (o retry fica no BullMQ para não multiplicar tentativas). Classificação para erros tipados do adaptador: `ModerationTransientError` (`5xx`, timeout, falha de rede), `ModerationRateLimitedError(retryAfterMs)` (`429`; `Retry-After` em segundos, padrão 1 s), `ModerationUnavailableError(retryAfterMs)` (circuito aberto, vindo do `CircuitOpenError`) e `ModerationInvalidRequestError` (`400`). Só `5xx`/timeout/rede contam para o circuito (`recordIf`); `429` e `400` não. O adaptador aceita `rejection_reason` e `reason`. O preço vai em reais (`priceCents / 100`).

**Fila e relay.** Um `OutboxTransport` (`BullmqTransport`) injeta a `Queue` e faz `queue.add(topic, payload, { jobId: message.id, ...opts })`, escolhendo a fila pelo tópico (hoje só `listing.submitted` → `moderation`; tópico desconhecido lança `NonRetryableMessageError`). Opções do job: tentativas e backoff exponencial com jitter do BullMQ (`attempts`, `backoff: { type: 'exponential', delay, jitter: 0.5 }`), `removeOnComplete` limitado e `removeOnFail: false` (o set `failed` é a DLQ). O relay roda só no worker (`OutboxModule.forRoot({ relay: { enabled: true, pollInterval } })` no `WorkerModule`); a API continua com `enabled: false`. O módulo do worker reutiliza o mesmo `PostgresOutboxStore` do módulo da API (extraído para ser compartilhado).

**Worker criado à mão, não com `@Processor`.** As opções de `@Processor` são estáticas (decorator), mas limite por segundo e concorrência precisam vir da configuração validada. Um provider cria o `Worker` do BullMQ no bootstrap com `ConfigService` e o fecha no shutdown; `@nestjs/bullmq` fornece a conexão e a `Queue` (`BullModule.forRootAsync` + `registerQueue`). Alternativa descartada: ler `process.env` na carga do módulo, que escapa da validação e do `.env` carregado pelo `ConfigModule`.

**Tradução de erros em ações do BullMQ.** No processador: `ModerationRateLimitedError`/`ModerationUnavailableError` → `worker.rateLimit(ms)` e `throw Worker.RateLimitError()` (não consome tentativa); `ModerationInvalidRequestError` → `UnrecoverableError` (falha imediata); `ModerationTransientError` → relança (retry/backoff do BullMQ). No evento `failed`, se o job esgotou as tentativas ou foi irrecuperável, chama `recordModerationFailure`.

**Reprocessamento.** `src/cli/reprocess-moderation.ts` (`pnpm moderation:reprocess`): lista `queue.getFailed()` e chama `job.retry('failed', { resetAttemptsMade: true })`. A idempotência do caso de uso torna seguro repetir.

**Configuração.** Novas variáveis no `env.ts` (com padrões do mock): `REDIS_URL`, `MODERATION_API_URL`, `MODERATION_TIMEOUT_MS` (3000), `MODERATION_ATTEMPTS` (5), `MODERATION_BACKOFF_MS` (1000), `MODERATION_RATE_LIMIT_PER_SECOND` (5), `MODERATION_CONCURRENCY` (5), `MODERATION_BREAKER_FAILURE_RATE` (50), `MODERATION_BREAKER_MIN_CALLS` (5), `MODERATION_BREAKER_OPEN_MS` (10000), `OUTBOX_POLL_INTERVAL_MS` (1000).

## Risks / Trade-offs

- [Circuito aberto compartilhado só dentro do processo] → o estado do breaker é por instância do worker; aceitável com um worker, e o limitador do BullMQ continua global via Redis. Registrar como limitação no README.
- [`removeOnComplete` permite republicação de mesma mensagem após conclusão] → o caso de uso é idempotente, então o job extra é descartado.
- [Falha registrada duas vezes em reprocessamentos repetidos] → cada falha definitiva é um fato novo; a auditoria acumula, sem efeito no status.
- [Mock com ~20% de 500 pode abrir o circuito (limiar 50%)] → improvável em operação normal; o mínimo de 5 chamadas e a meia-abertura em 10 s limitam o impacto, e abrir não consome tentativas.
