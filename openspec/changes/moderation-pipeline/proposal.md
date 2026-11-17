# Proposal

## Why

O enunciado exige que todo anúncio passe pela moderação antes de publicar, e o mock se comporta como um serviço externo instável (~20% de 500, limite de 5 req/s, latência de até 2 s). A integração precisa ser assíncrona e resiliente, sem nunca confundir falha técnica com reprovação de negócio.

## What Changes

- Relay do `@nestjs/outbox` rodando no worker, com `OutboxTransport` publicando na fila BullMQ `moderation` (`jobId` = id da mensagem).
- Worker de moderação: relê a versão no Postgres, descarta se não estiver `in_review` (idempotência) e chama o mock.
- Adaptador do mock: aceita `rejection_reason` e `reason`; classifica erros (`5xx`/timeout/`429` transitórios, `400` definitivo); timeout, circuit breaker (`@nestjs/resilience`) e limitador global de 5 jobs/s; `429` e circuito aberto pausam o worker sem consumir tentativa.
- Resultado numa única transação: `published` (arquivando a versão anterior) ou `rejected` com motivo, mais auditoria.
- Falha definitiva mantém o anúncio em `in_review`, com registro e script de reprocessamento dos jobs falhos.
- Configuração por variáveis de ambiente (timeouts, tentativas, thresholds).
- Fora de escopo: projeção no Redis e painel do Grafana.

## Capabilities

### New Capabilities
- `listing-moderation`: moderação assíncrona do anúncio e resultado de negócio (`published`/`rejected` com motivo).
- `moderation-resilience`: comportamento sob falha do serviço externo (retry, circuit breaker, limite de taxa, falha definitiva mantém `in_review`).
- `moderation-reprocessing`: reprocessamento operacional de jobs que falharam definitivamente.

### Modified Capabilities

## Impact

- Código: `src/modules/moderation/` (adaptador, worker, política), `worker.module.ts`, script de reprocessamento.
- Dependências: `bullmq`, `@nestjs/bullmq`, `@nestjs/resilience`, `@nestjs/outbox`.
- Depende de: `listing-lifecycle` (envio para revisão grava no outbox).
