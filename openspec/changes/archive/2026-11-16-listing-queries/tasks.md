# Tarefas

## 1. Configuração e contrato

- [x] 1.1 Adicionar `LISTINGS_DEFAULT_PAGE_SIZE` e `LISTINGS_MAX_PAGE_SIZE` em `shared/config/env.ts` (validando padrão ≤ máximo), em `.env.example` e no teste `env.spec.ts`
- [x] 1.2 Definir os tipos de leitura na aplicação (`ListingListItem`, `ListingPage`, `ListingDetail`) e a porta `ListingQueries` com `listPublished`, `findPublished` e `findLatestForSeller`

## 2. Casos de uso

- [x] 2.1 `ListPublishedListings` (monta a página com `offset`/`limit`) e esquema zod da query com padrão e máximo vindos da configuração
- [x] 2.2 `GetPublicListing` (`findPublished`, senão `ListingNotFoundError`) e `GetOwnListing` (`findLatestForSeller`, senão `ListingNotFoundError`)
- [x] 2.3 Testes unitários dos dois casos de uso com porta fake (404 quando a porta devolve `null`; `rejectionReason` só no resultado do dono)

## 3. Adaptador Postgres

- [x] 3.1 `DrizzleListingQueries.listPublished`: filtro de status e categoria, ordenação com desempate, `limit`/`offset`, capa por menor posição e `total`
- [x] 3.2 `findPublished` e `findLatestForSeller` com imagens ordenadas
- [x] 3.3 Testes de integração (Testcontainers): listagem (só publicados, nova versão em revisão, paginação, filtro, ordem estável, capa), `findPublished` (publicada com versão mais nova aberta, só rejeitada/arquivada → `null`) e `findLatestForSeller` (outro vendedor → `null`)

## 4. HTTP

- [x] 4.1 `ListingQueriesController` público com `GET /listings` e `GET /listings/:listingId` (UUID inválido → 404, `Authorization` ignorado)
- [x] 4.2 `MyListingsController` com `GET /me/listings/:listingId` sob `JwtAuthGuard` (UUID inválido → 404)
- [x] 4.3 DTOs de resposta (público sem `rejectionReason`; do dono com ele) e decorators do Swagger (parâmetros, respostas 200/400/401/404)
- [x] 4.4 Registrar providers e controllers em `ListingsModule`; mapear `ListingNotFoundError` com o filtro existente

## 5. Verificação e documentação

- [x] 5.1 Teste e2e de leitura (status forçado no banco no lugar do worker, já coberto em `moderation-pipeline`): listagem e detalhe público; rascunho e reprovado 404 para visitante e 200 para o dono (reprovado com motivo)
- [x] 5.2 Atualizar `backend/implementation/README.md` (contrato de `GET /listings`, `GET /listings/:id` e `GET /me/listings/:id`) e registrar D-novas em `DECISIONS.md` (reprovado visível só ao dono, rota `/me/listings/:id`, `limit` acima do máximo → 400, detalhe do dono = versão mais recente) e alinhar a tabela de visibilidade da `SPEC.md` e o `AGENTS.md`
- [x] 5.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` e `openspec validate listing-queries`
