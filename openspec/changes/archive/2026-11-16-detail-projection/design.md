# Design

## Context

Hoje só `listing.submitted` é gravado no outbox (`submit`); publicar, reprovar e arquivar não gravam nada. O relay do outbox vive no `ModerationModule` e o `BullmqTransport` só conhece a fila `moderation` (tópico desconhecido lança `NonRetryableMessageError`). A API não tem cliente Redis nem fila registrada. O detalhe público lê de `ListingQueries.findPublished` (Postgres), e só a versão `published` é pública (D18). Motivação em `proposal.md`; comportamento em `specs/listing-detail-projection/spec.md`.

O Compose roda o Redis com `maxmemory-policy noeviction` (exigência do BullMQ): chaves sem validade nunca são descartadas.

## Goals / Non-Goals

**Goals:**
- Detalhe público servido do Redis com fallback para o Postgres que nunca vira erro.
- Projeção reconstruível a qualquer momento só a partir do Postgres.

**Non-Goals:**
- Métricas de hit/miss/fallback e painel (nenhuma instrumentação OTel existe ainda; entram com a observabilidade).
- Projeção do detalhe do dono, da listagem ou de versões não publicadas.
- Invalidação síncrona: a consistência é eventual (janela = intervalo do relay + processamento).

## Decisions

**D1. Só `published` e `archived` geram mensagem; `listing.rejected` deixa de existir.** Como o detalhe público é só a versão publicada (D18), reprovar não muda o que o público vê. `publishReplacing` grava `listing.published` e `archiveAll` grava `listing.archived`, ambos `{ listingId }`, na mesma transação (`outbox.add(tx, …)`). `publishReplacing` arquiva a versão anterior na mesma transação, mas emite uma só mensagem. Isso ajusta o que a SPEC e o `AGENTS.md` dizem sobre `listing.rejected`.

**D2. Um único job idempotente: "sincronizar o anúncio".** Qualquer mensagem (`published`, `archived`) ou reconstrução vira o job `{ listingId }`. O `ProjectListing` lê `findPublished(listingId)`: achou → `SET` do payload com validade; não achou → `DEL`. Não usa o conteúdo do evento, então duplicata, atraso e ordem trocada convergem para o mesmo estado (spec: idempotência). Concorrência 1 no worker, como a SPEC define. Alternativa descartada: tratar cada tópico com lógica própria (aplicar/remover conforme o evento): depende da ordem das mensagens e exige versionamento.

**D3. Chave e valor.** `listing:detail:<listingId>`, valor = JSON do `ListingDetail` (mesmo objeto que a API devolve; datas em ISO, revividas ao ler). O formato é definido uma vez em `listing-queries`; a projeção só o serializa. Validade `DETAIL_CACHE_TTL_SECONDS` (padrão 86400): com `noeviction` e sem TTL a memória só cresceria, e a validade corrige sozinha uma mensagem perdida. Custo: um miss por anúncio por dia, que dispara uma reconstrução.

**D4. Porta `PublicDetailCache` (`get`, `set`, `remove`) com adaptador ioredis.** A API só chama `get`; o worker, `set`/`remove` (a regra "leitura nunca escreve" é coberta por teste: o caso de uso de leitura recebe a porta e o teste verifica que não há `set`). O cliente da API usa `commandTimeout = DETAIL_CACHE_TIMEOUT_MS` (padrão 200), `enableOfflineQueue: false` e `maxRetriesPerRequest: 1`: com o Redis fora, o `get` falha na hora em vez de enfileirar comandos. O `get` converte erro e timeout em exceção; quem decide o fallback é o caso de uso. Alternativa descartada: `Promise.race` com timer manual (deixa o comando pendurado na conexão).

**D5. Leitura em `GetPublicListing`.** `cache.get` → hit: devolve. Miss/erro/timeout: `ListingQueries.findPublished` → `null`: `ListingNotFoundError`, sem reconstrução (evita que UUIDs aleatórios encham a fila); achou: pede reconstrução e devolve o detalhe do banco. O pedido é `queue.add('rebuild', { listingId }, { jobId: 'rebuild-<listingId>', removeOnComplete: true, removeOnFail: true })` sem `await` no caminho da resposta e com o erro apenas logado. O `jobId` fixo deduplica enquanto o job existe; como é removido ao terminar, um miss posterior pode reenfileirar. Pedido de reconstrução com o Redis fora também falha em silêncio.

**D6. Roteamento do outbox por tópico, relay compartilhado.** O relay e o `BullmqTransport` saem do `ModerationModule` para um módulo do worker (`shared/outbox`) que registra as duas filas; o transport passa a mapear tópico → fila (`listing.submitted` → `moderation`; `listing.published`/`listing.archived` → `projection`) com as opções de job de cada uma (moderação mantém tentativas e backoff atuais; projeção usa 5 tentativas com backoff exponencial, `removeOnComplete` limitado e `removeOnFail: false`). `jobId` continua sendo o id da mensagem. Alternativa descartada: um segundo transport: duplica o relay e o `route`.

**D7. Módulos.** `src/modules/projection/` com `application/` (`ProjectListing`, porta do cache), `infrastructure/` (cache ioredis, worker BullMQ da fila `projection`, constantes da fila) e o módulo. A API importa o que precisa para ler (cache `get`, fila de reconstrução) no `ListingsModule`; o worker importa o `ProjectionModule`.

## Risks / Trade-offs

- [Janela de inconsistência: após publicar uma nova versão ou arquivar, o público pode ver o estado antigo até o relay e o worker rodarem] → Aceita (consistência eventual); a janela é o `OUTBOX_POLL_INTERVAL_MS` mais o processamento. Documentada no README.
- [Redis com `noeviction` e sem validade encheria] → TTL configurável (D3).
- [Miss em massa após o Redis ser esvaziado] → O fallback absorve a leitura e a deduplicação limita a uma reconstrução por anúncio.
- [Redis lento prejudica a latência do detalhe] → Timeout curto (D4) limita o custo extra ao tempo limite.
- [Muda o contrato do outbox: o transport deixa de recusar `listing.published`/`archived`] → Cobertura com teste de integração do roteamento por tópico.
