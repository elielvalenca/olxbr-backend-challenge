# Tasks

Todas as tasks rodam em `backend/implementation/` com Node 22. Testes de integração (`*.int-spec.ts`) usam Testcontainers; e2e (`test/*.e2e-spec.ts`) usam o Postgres do Compose ou o helper existente em `test/support`.

## 1. Domínio

- [x] 1.1 Adicionar a tabela de transições e `assertTransition` em `domain/listing-status.ts`, com `InvalidTransitionError` e `ListingNotFoundError` em `domain/listing-errors.ts`; verificar com teste unitário que cobre a matriz 5×5 de transições (válidas e inválidas) e `pnpm typecheck` sem imports de `@nestjs/*` no domínio.
- [x] 1.2 Criar o esquema zod do conteúdo e `LISTING_LIMITS` em `application/listing-content.ts` (título com trim 10–100, descrição não vazia até 5000, preço inteiro > 0, 6 categorias, 1–10 URLs `https`) e a variante parcial para edição, com a função de mesclar conteúdo atual e alterações; verificar com testes unitários dos cenários de `listing-authoring` (título curto, título com espaços, preço zero/decimal/texto, categoria desconhecida, imagens vazias/11/`http`, edição vazia, preço fora de faixa aceito).

## 2. Repositório

- [x] 2.1 Estender a porta `ListingRepository` com `findLatest`, `updateDraft`, `submit`, `archiveAll` e o `content` opcional de `createNextVersion`; verificar com `pnpm typecheck`.
- [x] 2.2 Registrar `Outbox<Transaction>` (`@nestjs/outbox` com `PostgresOutboxStore`, `migrate: false`, relay desabilitado na API) e implementar no adaptador Drizzle `findLatest`, `updateDraft` (troca de imagens e conflito se não for mais `draft`), `createNextVersion` com conteúdo e `submit` (transição + `outbox.add` de `listing.submitted` com `{ listingId, version }` na mesma transação); verificar com `pnpm typecheck` e `pnpm build`.
- [x] 2.3 Implementar `archiveAll` no adaptador (lock das versões, recusa com `ListingVersionConflictError` se houver `in_review` ou nada a arquivar, um evento por versão); verificar com `pnpm typecheck`.
- [x] 2.4 Escrever os testes de integração do repositório novo: `submit` grava status, auditoria e mensagem do outbox, e reverte tudo se a mensagem falhar; `updateDraft` troca imagens e recusa versão não `draft`; `createNextVersion` com conteúdo sobrepõe a cópia e preserva a versão original; `archiveAll` com `published`+`draft`, com `in_review` e já arquivado; `findLatest` devolve a maior versão; edição concorrente (uma conclui); verificar com `pnpm test:int`.

## 3. Casos de uso

- [x] 3.1 Implementar `CreateListing` e `EditListing` (dono via `findLatest` com `ListingNotFoundError` para inexistente ou de outro vendedor; `draft` → `updateDraft`; `published`/`rejected` → próxima versão; `in_review`/`archived` → `InvalidTransitionError`); verificar com testes de integração dos cenários de edição (publicada, rejeitada, rascunho, em revisão, arquivada, outro vendedor, inexistente, inválida sem efeito).
- [x] 3.2 Implementar `SubmitListing` e `ArchiveListing` com as mesmas checagens de dono e `assertTransition`; verificar com testes de integração dos cenários de envio (rascunho, sem rascunho) e de arquivamento (publicado com rascunho aberto, com `in_review`, já arquivado) e do histórico de auditoria em ordem.

## 4. Autenticação

- [x] 4.1 Adicionar `@nestjs/jwt` e `JWT_SECRET` ao schema de env (obrigatório, mínimo 32 caracteres) e ao `.env.example`; verificar com teste unitário do env (ausente e curto falham no boot) e `pnpm typecheck`.
- [x] 4.2 Criar em `src/shared/auth/` o `JwtAuthGuard` (HS256 fixo, `sub` não vazio obrigatório) e o decorator `@SellerId()`; verificar com testes unitários dos cenários de `seller-authentication` (sem token, assinatura inválida, expirado, `alg: none`, outro algoritmo, sem `sub`, válido).
- [x] 4.3 Criar o script `src/cli/token.ts` e `pnpm auth:token <sellerId> [--expires-in]`; verificar emitindo um token e validando-o com o mesmo segredo, e que sem argumento o script sai com erro e instruções de uso.

## 5. HTTP

- [x] 5.1 Criar o `ListingsModule` (controller, casos de uso, repositório, `Outbox`, guard) importado no `AppModule`, com o pipe de validação zod (400 com lista de campos), o filtro de exceções (409/404; demais 500 sem vazar detalhe) e `:listingId` não UUID como 404; verificar com `pnpm build`.
- [x] 5.2 Implementar `POST /listings`, `PATCH /listings/:listingId`, `POST /listings/:listingId/submit` e `POST /listings/:listingId/archive`, com DTOs de Swagger (Bearer, corpos, 2xx, 400/401/404/409); verificar abrindo `/docs` e conferindo os quatro endpoints e o esquema de autenticação.
- [x] 5.3 Escrever testes e2e (supertest) do fluxo criar → editar → enviar → arquivar, de 401 sem/inválido token, 400 de validação, 404 de outro vendedor e 409 de transição inválida; verificar com `pnpm test:e2e`.

## 6. Documentação e fechamento

- [x] 6.1 Atualizar `backend/implementation/README.md` com o contrato dos quatro endpoints, como gerar o token (`pnpm auth:token`) e o `JWT_SECRET`, e completar em `AGENTS.md` a lacuna "gerar JWT"; verificar executando os comandos documentados exatamente como escritos.
- [x] 6.2 Registrar em `DECISIONS.md` a decisão D16 (zod, edição parcial sobre a versão mais recente, arquivamento do anúncio inteiro, 404 para outro vendedor, guard próprio) e rodar `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`; verificar que tudo passa.

## Workflow follow-up

- Um único commit com planejamento e implementação, e arquivamento da change em commit separado (convenção do projeto).
