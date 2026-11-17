# Tarefas

## 1. Configuração

- [x] 1.1 Adicionar `DETAIL_CACHE_TIMEOUT_MS` (200) e `DETAIL_CACHE_TTL_SECONDS` (86400) em `shared/config/env.ts`, `.env.example` e `env.spec.ts`

## 2. Mensagens do outbox

- [x] 2.1 `publishReplacing` grava `listing.published` e `archiveAll` grava `listing.archived` (`{ listingId }`) na mesma transação
- [x] 2.2 Teste de integração: publicação (inclusive substituindo a anterior, uma só mensagem), arquivamento, conflito desfaz a mensagem, reprovação sem mensagem

## 3. Transport e relay compartilhados

- [x] 3.1 Mover relay e `BullmqTransport` para um módulo do worker em `shared/outbox`, registrando as filas `moderation` e `projection`; transport mapeia tópico → fila com as opções de job de cada uma
- [x] 3.2 Teste: `listing.submitted` vai para `moderation`, `listing.published`/`listing.archived` para `projection` com `jobId` = id da mensagem, tópico desconhecido continua não retentável

## 4. Projeção

- [x] 4.1 Porta `PublicDetailCache` e adaptador ioredis (`get` com `commandTimeout`, `set` com TTL, `remove`; datas revividas ao ler)
- [x] 4.2 `ProjectListing`: `findPublished` → `set`, ou `remove` se não houver; teste unitário com fakes (publicado, arquivado, repetido, ordem trocada)
- [x] 4.3 Worker da fila `projection` (concorrência 1, tentativas e backoff) e `ProjectionModule` registrado no `WorkerModule`
- [x] 4.4 Teste de integração com Redis (Testcontainers) e Postgres: publicar → mensagem → projeção existe; arquivar → projeção removida; TTL aplicado

## 5. Leitura na API

- [x] 5.1 Cliente Redis da API (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`) e fila `projection` registrada no `ListingsModule`
- [x] 5.2 `GetPublicListing`: hit → cache; miss/erro/timeout → Postgres; achou no banco → pede reconstrução sem `await` (`jobId` por anúncio, erro só logado); não achou → 404 sem reconstrução
- [x] 5.3 Testes unitários com fakes: hit, miss, erro, timeout, 404 sem reconstrução, falha do pedido de reconstrução, leitura nunca chama `set`/`remove`
- [x] 5.4 Teste de integração/e2e: com Redis fora a resposta vem do banco; deduplicação de reconstruções (vários misses, um job pendente)

## 6. Verificação e documentação

- [x] 6.1 Estender o teste de pipeline: criar → enviar → worker → `published` → projeção presente e detalhe público idêntico ao do banco
- [x] 6.2 Atualizar `SPEC.md` (fila `projection` só com `published`/`archived`, sem `listing.rejected`) e `AGENTS.md`; seção "Projeção do detalhe" no README (janela de consistência, TTL, fallback); registrar a decisão em `DECISIONS.md`
- [x] 6.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` e `openspec validate detail-projection --strict`
