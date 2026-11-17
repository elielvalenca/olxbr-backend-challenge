# Proposal

## Why

O detalhe público é a leitura mais frequente por anúncio. Servi-lo de uma projeção pré-computada no Redis, com fallback para o Postgres, reduz carga no banco e demonstra o caminho de evolução para leitura em escala, sem a complexidade de uma materialized view.

## What Changes

- O repositório passa a gravar no outbox, na mesma transação, `listing.published` (publicação, inclusive a que arquiva a versão anterior) e `listing.archived` (arquivamento do anúncio). A reprovação **não** gera evento: o detalhe público é só a versão `published` (D18), e reprovar não a altera.
- Fila `projection` alimentada pelo relay do outbox. Worker de projeção (concorrência 1, único escritor da projeção): reconstrói o payload a partir do estado atual do Postgres e grava pronto no Redis; sem versão publicada, remove a chave.
- Detalhe público (`GET /listings/:listingId`) lido primeiro do Redis, com timeout configurável por env e fallback para o Postgres em miss, erro ou timeout.
- Em miss de um anúncio que existe publicado, a API enfileira uma reconstrução deduplicada por `listing_id` (no máximo uma pendente por anúncio).
- Fora de escopo: detalhe do dono (continua direto do Postgres), projeção da listagem (evolução documentada), métricas de hit/miss/fallback (dependem da change de observabilidade, ainda não feita).

## Capabilities

### New Capabilities
- `listing-detail-projection`: payload pré-computado do detalhe público no Redis, consistência eventual e fallback para o banco.

### Modified Capabilities

## Impact

- Código: `src/modules/projection/` (caso de uso, cache Redis, worker), `ListingRepository` (mensagens no outbox), transport do outbox (roteia por tópico para duas filas), `GetPublicListing` (lê do cache), `worker.module.ts`, `listings.module.ts`, `env.ts`.
- Depende de: `moderation-pipeline` (relay e transport do outbox) e `listing-queries` (`findPublished` como fonte e fallback).
- Ajusta `SPEC.md` e `AGENTS.md`: a projeção cobre só `published`; `listing.rejected` deixa de existir.
- Primeira candidata a corte se o tempo apertar.
