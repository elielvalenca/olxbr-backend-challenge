# Design

## Context

Hoje só existem escritas: `ListingsController` exige `JwtAuthGuard` em todo o controller, e o `ListingRepository` (porta) tem só operações de escrita e `findLatest`/`findVersion` para decisão de escrita. O schema já traz os índices parciais `listings_published_by_category` e `listings_published_recent` (`status = 'published'`), feitos para a listagem; o índice único `listings_one_published` garante no máximo uma versão publicada por anúncio. Motivação em `proposal.md`; comportamento nas specs `listing-search` e `listing-detail`.

A change seguinte (`detail-projection`) vai pôr o Redis na frente do detalhe com fallback para o Postgres. Portanto a leitura do detalhe do Postgres deve ficar atrás de uma porta que a projeção possa reutilizar como fallback e como fonte de construção do payload.

## Goals / Non-Goals

**Goals:**
- Listagem e os dois detalhes lidos do Postgres, com as regras de visibilidade das specs.
- Resposta de detalhe num formato único (o futuro payload da projeção será o mesmo).

**Non-Goals:**
- Cache, Redis, cursor, busca por texto, ordenação alternativa.
- Listar os anúncios do próprio vendedor (não pedido pelo enunciado nem pela SPEC).
- Escolher uma versão específica no detalhe do dono; autenticação opcional em qualquer rota.

## Decisions

**D1. Porta de leitura separada: `ListingQueries`.** Em vez de crescer o `ListingRepository` (escrita, transacional, ligado a outbox), uma porta `ListingQueries` com `listPublished(...)`, `findPublished(listingId)` e `findLatestForSeller(listingId, sellerId)`, implementada por `DrizzleListingQueries`. Escrita e leitura têm formas diferentes; a separação evita misturar DTOs de leitura com o modelo de escrita e dá à `detail-projection` um ponto de reuso. Descartado: métodos novos no `ListingRepository` (porta já grande, com responsabilidade transacional).

**D2. Duas consultas simples, sem regra de papel.** O detalhe público é `findPublished(listingId)` (`status = 'published'`, no máximo uma linha pelo índice `listings_one_published`); o do dono é `findLatestForSeller(listingId, sellerId)` (maior versão do anúncio, `NULL` se o vendedor não for o dono). Cada visão tem seu caso de uso (`GetPublicListing`, `GetOwnListing`) e 404 via `ListingNotFoundError`. Como não há mais decisão por papel, a regra de visibilidade é o próprio filtro da consulta, coberta por teste de integração. Descartado: um endpoint único com guard opcional e regra de visibilidade no caso de uso (mistura duas visões, exige guard opcional e dá ao token inválido um tratamento ambíguo).

**D3. Endpoints separados por visão.** `GET /listings/:listingId` é público e ignora `Authorization`. `GET /me/listings/:listingId` usa o `JwtAuthGuard` existente. Sem guard opcional. A rota `/me` deixa espaço para `GET /me/listings` no futuro (fora de escopo).

**D4. Dois controllers.** `ListingsController` continua só com escrita autenticada; `ListingQueriesController` (`GET /listings`, `GET /listings/:listingId`, público) e `MyListingsController` (`GET /me/listings/:listingId`, autenticado) ficam com a leitura. Mantém "controllers finos" e evita guard por método.

**D5. Listagem: consulta paginada + contagem.** `SELECT ... WHERE status='published' [AND category=$1] ORDER BY published_at DESC, listing_id ASC LIMIT/OFFSET`, mais `SELECT count(*)` com o mesmo filtro, executadas em paralelo. A capa vem de subconsulta correlacionada (imagem de menor posição) só para as linhas da página. O desempate por `listing_id` torna a paginação estável. O `count(*)` varre o índice parcial; aceitável no volume do desafio, e `total` é o metadado que o enunciado pede. Descartado: cursor (já fora de escopo) e `total` estimado.

**D6. Limites por configuração.** `LISTINGS_DEFAULT_PAGE_SIZE` (20) e `LISTINGS_MAX_PAGE_SIZE` (50) em `env.ts`, validados no boot (padrão ≤ máximo). `limit` acima do máximo → 400 (não clamp silencioso): o cliente descobre o limite em vez de receber menos do que pediu. Query validada por zod com o mesmo pipe das escritas; `category` usa o enum `LISTING_CATEGORIES` já existente.

**D7. Detalhe do dono = versão mais recente.** Cobre todos os status das suas versões sem parâmetro extra; o dono com versão publicada e rascunho novo vê o rascunho (é o que ele está editando). Ver a publicada exigiria `?version=`; fica como evolução, registrado nos riscos.

**D8. Formato de resposta.** DTOs de resposta (`ListingListResponseDto`, `ListingDetailDto`) só para o Swagger, como nas escritas; o formato real é tipado na aplicação. `sellerId` nunca sai. `rejectionReason` só existe no DTO do dono e só quando `rejected`; o DTO público não tem o campo.

## Risks / Trade-offs

- [`count(*)` e `OFFSET` custam mais em páginas profundas] → Índices parciais mantêm o custo baixo no volume do desafio; cursor/projeção da listagem documentados como evolução.
- [Dono não alcança a versão publicada enquanto há rascunho mais novo] → Documentado; `?version=` seria extensão compatível.
- [Visitante não vê anúncio reprovado nem o motivo; isso diverge da SPEC original] → Decisão do usuário: reprovação é assunto do dono; SPEC, AGENTS.md e `DECISIONS.md` atualizados junto.
- [A `detail-projection` assume `rejected` público e projeta `listing.rejected`] → Ao detalhá-la, a projeção cobre só o detalhe público (`published`); o do dono segue no Postgres. O formato público é definido aqui (D8) e será o payload projetado.
