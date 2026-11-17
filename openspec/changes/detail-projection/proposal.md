# Proposal

## Why

O detalhe é a leitura mais frequente por anúncio. Servi-lo de uma projeção pré-computada no Redis, com fallback para o Postgres, reduz carga no banco e demonstra o caminho de evolução para leitura em escala, sem a complexidade de uma materialized view.

## What Changes

- Fila `projection` alimentada pelo outbox nos eventos de publicação, reprovação e arquivamento.
- Worker de projeção (concorrência 1, único escritor no Redis): reconstrói o payload do detalhe a partir do estado atual do Postgres e grava pronto; arquivamento remove a chave.
- Leitura do detalhe público sempre pelo Redis, com timeout configurável por env e fallback para o Postgres em miss, erro ou timeout.
- Em miss, enfileira reconstrução deduplicada por `listing_id` (no máximo um pedido pendente por anúncio).
- Detalhe do dono para `draft`/`in_review` continua direto do Postgres.
- Fora de escopo: projeção da listagem (evolução documentada).

## Capabilities

### New Capabilities
- `listing-detail-projection`: payload pré-computado do detalhe no Redis, consistência eventual e fallback para o banco.

### Modified Capabilities

## Impact

- Código: `src/modules/projection/` (worker, builder do payload), ajuste no caso de uso de detalhe, métricas de hit/miss/fallback.
- Depende de: `moderation-pipeline` (eventos de publicação) e `listing-queries` (detalhe no Postgres como fonte e fallback).
- Primeira candidata a corte se o tempo apertar.
