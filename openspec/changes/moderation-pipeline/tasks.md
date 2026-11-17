# Tasks

## 1. Dependências e configuração

- [x] 1.1 Adicionar `bullmq`, `@nestjs/bullmq` e `@nestjs/resilience`; liberar o build opcional do `msgpackr-extract` no `pnpm-workspace.yaml`
- [x] 1.2 Validar as novas variáveis em `env.ts` (com teste) e atualizar `.env.example`

## 2. Repositório

- [x] 2.1 Adicionar `expectedFrom` a `TransitionDetails` e usá-lo em `applyTransition`, `transition` e `publishReplacing`
- [x] 2.2 Adicionar `findVersion(ref)` e `recordModerationFailure(ref, error)` ao repositório
- [x] 2.3 Teste de integração: resultado só aplica a `in_review` (publicação arquivando a anterior atomicamente, rejeição com motivo, conflito desfaz tudo, falha registrada sem mudar status)

## 3. Caso de uso e adaptador

- [x] 3.1 Porta `ModerationGateway` e erros tipados em `src/modules/moderation/application/`
- [x] 3.2 Caso de uso `ModerateListing` (idempotência, aprovação, rejeição) com teste unitário
- [x] 3.3 Adaptador HTTP do mock (timeout, `rejection_reason`/`reason`, preço em reais, classificação de erros, circuit breaker via `ResilienceService`) com testes unitários da classificação

## 4. Fila e worker

- [x] 4.1 `BullmqTransport` do outbox e módulo do relay no worker (outbox compartilhado com a API)
- [x] 4.2 Worker de moderação (limitador, concorrência, `RateLimitError`, `UnrecoverableError`, registro de falha definitiva) e `WorkerModule`
- [x] 4.3 Teste de integração ponta a ponta (Postgres + Redis + mock em memória com `x-mock-force`): publicada, reprovada, 500 depois sucesso, 429, `400`/esgotado deixa `in_review`

## 5. Reprocessamento e documentação

- [x] 5.1 Script `moderation:reprocess` (`src/cli/reprocess-moderation.ts`) com teste de integração
- [x] 5.2 Atualizar README da implementação e AGENTS.md (comandos), registrar decisões em `DECISIONS.md` e na timeline via `registro-entrega`
