# Decisões

Decisões técnicas, alternativas descartadas, ambiguidades e trade-offs. A ordem cronológica está em [AI_LOG.md](AI_LOG.md).

## Decisões técnicas

### D1 — Escopo proporcional ao esforço do desafio
- **Contexto:** a especificação inicial incluía JWT, BullMQ, circuit breaker, OTel, Prometheus, Jaeger, Grafana, Testcontainers, versionamento append-only, materialized view, BFF com HMAC e teste A/B — muito além das 4–6h estimadas pelo desafio, que avalia "solução proporcional, sem abstrações sobrando".
- **Escolha:** essencial (CRUD + ciclo de status + moderação assíncrona resiliente + JWT + Swagger + testes + Compose), mais OTel mínimo e um painel do Grafana para a fila de moderação, porque preciso de observabilidade no relay.
- **Alternativas consideradas:** implementar toda a spec inicial — descartado pelo custo e pelo risco de entregar peças que não domino a fundo. Jaeger e Prometheus dedicados — fora. BFF com HMAC, projeção da listagem e teste A/B — documentados como evolução.
- **Trade-off:** menos peças para demonstrar, em troca de um núcleo bem testado e explicável.

### D2 — Versionamento append-only dos anúncios
- **Contexto:** quero histórico de versões (base para A/B no futuro) sem atrapalhar a edição de rascunhos.
- **Escolha:** `listing_id` estável + `version`. `draft` é editável no lugar; editar `published`/`rejected` cria nova versão `draft`; ao publicar a nova, a anterior vai para `archived` pelo sistema; enquanto a nova está em revisão, a anterior continua publicada. Usuário pode arquivar a partir de qualquer status exceto `in_review`.
- **Alternativas consideradas:** linha única mutável com histórico só na auditoria — mais simples, mas perde o versionamento que motivou a spec.
- **Trade-off:** consultas precisam escolher a versão vigente, em troca de histórico completo e de nunca tirar do ar um anúncio publicado durante a revisão de uma edição.

### D3 — Preço em centavos (`bigint`)
- **Contexto:** valores monetários; o mock recebe o preço em reais como `number`.
- **Escolha:** inteiro em centavos (base 100) no domínio, no banco e na API; conversão para reais só no adaptador da moderação.
- **Alternativas consideradas:** `float` — descartado por imprecisão; `numeric(12,2)` — descartado: `bigint` em centavos é mais performático (aritmética inteira, sem tipo decimal arbitrário) e mais seguro contra erros de arredondamento.

### D4 — Validação estática no draft, sem competir com a moderação
- **Contexto:** o enunciado exige preço > 0 e título de 10–100 caracteres na criação; o mock também reprova preço fora da faixa da categoria.
- **Escolha:** validar na criação/edição do draft só regras estáticas (título, preço > 0, categoria conhecida, 1–10 URLs `https`). Faixa de preço por categoria fica com a moderação.
- **Alternativas consideradas:** validar faixa de preço localmente — descartado: duplicaria a regra do serviço externo e o motivo `price_out_of_range` nunca apareceria.

### D5 — Moderação assíncrona com outbox + BullMQ
- **Contexto:** o mock tem ~20% de erro, 5 req/s e latência de até 2s; mudar o status no banco e enfileirar no Redis são duas escritas que podem divergir.
- **Escolha:** outbox transacional com o pacote oficial `@nestjs/outbox`: a mensagem é gravada na mesma transação Drizzle da mudança de status, e o relay do pacote faz **polling** com lease, retry com backoff e dead letters. Um `OutboxTransport` próprio publica no BullMQ com `jobId = id da mensagem`, o que torna a republicação idempotente. Jobs carregam só `{listingId, version}`; o worker relê o banco e descarta se a versão não estiver mais `in_review`. Retry: 5 tentativas com backoff exponencial e jitter; `5xx`/timeout reprocessam, `400` falha na hora; `429` e circuito aberto pausam o worker via `worker.rateLimit()` sem consumir tentativa. Timeout e circuit breaker com `@nestjs/resilience` (retry do pacote desligado para não somar com o do BullMQ), limitador global do BullMQ de 5 jobs/s.
- **Alternativas consideradas:** enfileirar direto após o commit — descartado por perder eventos se o processo cair entre o commit e o enqueue. Enqueue após commit + varredura de segurança — descartado por criar dois caminhos para a mesma coisa. SQS — escolha mais provável em produção; BullMQ aproveita o Redis já presente no projeto. Outbox e despachante escritos à mão (desenho inicial, com `FOR UPDATE SKIP LOCKED`) — descartado ao descobrir o `@nestjs/outbox` no NestJS 12: ele faz o mesmo polling, já traz retry, dead letters com reenfileiramento e métricas, e a própria documentação recomenda o padrão de transporte para BullMQ que adotamos; menos código nosso para manter e testar. `opossum` — descartado em favor do `@nestjs/resilience`, oficial e com eventos de estado do breaker. `LISTEN/NOTIFY` no lugar do polling — descartado por ser mais uma peça para explicar.
- **Trade-off:** latência de até um ciclo de polling e consultas periódicas ao banco, em troca de garantia de entrega simples de explicar.

### D6 — Falha definitiva de integração mantém o anúncio em revisão
- **Contexto:** `rejected` é status de negócio e não pode esconder falhas técnicas.
- **Escolha:** retries esgotados ou `400` deixam o anúncio em `in_review`, registram a falha (audit + job falho no BullMQ) e há script de reprocessamento.
- **Alternativas consideradas:** DLQ como fila dedicada com consumidor próprio — simplificado por ora; fica como evolução.

### D7 — Projeção do detalhe no Redis
- **Contexto:** o detalhe é a leitura mais frequente por anúncio; a IA sugeriu índice parcial no Postgres ou tabela de projeção em vez de materialized view.
- **Escolha:** payload do detalhe pré-computado e salvo pronto no Redis por um job disparado pelos eventos do outbox (publicação, reprovação, arquivamento). Leitura sempre do Redis, com timeout configurável por env e fallback para o Postgres. Em miss, a API enfileira uma reconstrução com deduplicação por `listing_id` (no máximo um pedido pendente por anúncio), e o projection worker é o único escritor no Redis, com concorrência 1 para evitar escrita fora de ordem. Escolhi assim porque o cache é facilmente gerenciado pelos gatilhos de mudança de status, que já passam pelo outbox.
- **Alternativas consideradas:** materialized view — descartada (refresh da view inteira, anúncio só aparece após o refresh); índice parcial / tabela de projeção no Postgres (sugestão da IA). A listagem continua no Postgres com índice parcial; projeção da listagem fica como evolução.
- **Trade-off:** mais um job e consistência eventual no detalhe, em troca de leitura barata e independente do banco.

### D8 — Autenticação JWT sem cadastro
- **Escolha:** JWT HS256 emitido por script; `sub` vira `seller_id`. Listagem e detalhe públicos; escrita autenticada.
- **Alternativas consideradas:** cadastro de vendedor — fora do escopo do enunciado.

### D9 — Drizzle como ORM/migrations
- **Escolha:** Drizzle: SQL explícito, migrations versionadas, tipos sem acoplar o domínio a entidades do ORM.
- **Alternativas consideradas:** TypeORM (padrão do NestJS) e Prisma. Num contexto de produção, eu revisaria a escolha de ORM com uma RFC, em vez de assumir o padrão do framework.

### D10 — Ferramentas de base
- **Escolha:** NestJS 12 (ESM puro), pnpm, Vitest, oxlint + Prettier e Testcontainers para integração com Postgres/Redis reais. BFF fora do escopo.
- **Alternativas consideradas:** Jest — escolhido inicialmente por ser "o padrão do NestJS", premissa que veio da IA e estava desatualizada: no NestJS 12 o padrão é Vitest, e Jest com ESM puro exige configuração experimental. ESLint — trocado pelo oxlint, padrão do scaffold, para não manter configuração extra.

### D11 — API e worker em processos separados
- **Escolha:** mesma imagem e base de código, dois entrypoints (`main.ts` e `worker.ts`), dois serviços no Compose. O worker roda o relay do outbox e as filas `moderation` e `projection`.
- **Alternativas consideradas:** worker no mesmo processo da API — descartado: uma falha ou pico na fila afetaria a API, e não daria para escalar os dois separadamente.

### D12 — Observabilidade com `grafana/otel-lgtm`
- **Contexto:** preciso de observabilidade no relay (fila de moderação), sem montar Prometheus e Jaeger separados. O Grafana não armazena métricas; precisa de uma fonte de dados.
- **Escolha:** OTel SDK Node com auto-instrumentação, exportando OTLP para o container `grafana/otel-lgtm` (coletor + Prometheus + Tempo + Grafana em um container). Métricas da fila: profundidade por estado, jobs por resultado, latência da moderação, estado do circuit breaker e outbox pendente. A instrumentação OTel específica do NestJS ainda não suporta o v12; HTTP, `pg` e Redis são instrumentados normalmente. Um painel provisionado por arquivo.
- **Alternativas consideradas:** NestJS Observe (oficial) — descartado: é SaaS hospedado e não recebe OTLP, e quero tudo rodando localmente. Grafana lendo direto do Postgres — descartado: não enxerga o estado do BullMQ nem do circuit breaker. Prometheus + Jaeger dedicados — mais containers e configuração para o escopo atual.

### D13 — Planejamento em cinco changes do OpenSpec
- **Contexto:** planejar a entrega inteira antes de implementar, sem especificar em excesso o que ainda depende de código.
- **Escolha:** cinco changes, em ordem: `listing-data-model` → `listing-lifecycle` → `moderation-pipeline` → `listing-queries` → `detail-projection`. Cada uma nasce só com `proposal.md`; `design.md`, specs e tasks são detalhados quando a change for implementada. A moderação vem antes da leitura por ser o fluxo central e o maior risco técnico. Seed, scripts, observabilidade, Dockerfile e README ficam como `chore`, sem change.
- **Alternativas consideradas:** quatro changes com modelagem dentro do ciclo de vida (proposta da IA) — descartada: quero mais qualidade nas decisões de modelagem e migrations (versionamento, constraints, índices), que são caras de desfazer. Detalhar todos os artefatos agora — descartado: risco de cascata, já que decisões como a integração do outbox com a transação do Drizzle só se fecham com código.
- **Trade-off:** uma change a mais para manter, em troca de uma modelagem revisada isoladamente. A projeção é a primeira candidata a corte se o tempo apertar.

### D14 — Modelagem das versões (change `listing-data-model`)
- **Contexto:** o anúncio é append-only por versão; quero que o banco garanta as invariantes, em vez de controlar race conditions na aplicação.
- **Escolha:**
  - `listings` com PK composta `(listing_id, version)`; `listing_id` é um UUID v4 sem tabela própria.
  - Dois índices únicos parciais: um por `listing_id` onde `status = 'published'` (uma versão ativa) e outro onde `status IN ('draft','in_review')` (uma versão aberta). Como índice parcial não é `DEFERRABLE`, a publicação arquiva a versão anterior antes de publicar a nova, na mesma transação; a corrida entre dois jobs vira `unique_violation`, tratada pelo retry e pela idempotência do worker.
  - `listing_images` por versão, copiada ao criar nova versão, com FK composta.
  - `listing_audit_events` escrita pela aplicação na mesma transação, com `metadata jsonb` para enriquecimento futuro por metadados vindos da API.
  - Preço em `bigint` com `CHECK (> 0)` no banco; status em `text` com `CHECK`; `rejection_reason` em `text` livre; datas em `timestamptz`.
- **Alternativas consideradas:** coluna `is_current` — descartada: pode divergir do status; imagens compartilhadas por `listing_id` — descartada: editar o rascunho alteraria o anúncio publicado, quebrando a imutabilidade; imagens em `jsonb` — descartada em favor da tabela filha (_motivo da preferência: a confirmar_; a IA argumentou extensibilidade e aderência à SPEC), ao custo de o mínimo de 1 imagem ficar só na aplicação; PK surrogate por versão — descartada: o par já é a identidade usada no job, na auditoria e na chave do Redis; auditoria por trigger — descartada: precisa de contexto (ator, motivo, metadados da API) que só a aplicação conhece.
- **Divergência:** a IA propôs `CHECK` de 10 a 100 caracteres no título; **recusei** porque quero ajustar esse limite por configuração no futuro, sem migration. O limite do título fica só na aplicação (e a coluna é `text`, sem `varchar(n)`).
- **Trade-off:** invariantes críticas no banco, regras de negócio ajustáveis na aplicação.
- **Na implementação:** o repositório (`ListingRepository`) traduz `unique_violation` em `ListingVersionConflictError` e faz cada transição (status + evento) numa única transação, com lock de linha só para ler o status atual; criei um índice extra em `listing_audit_events (listing_id, version, id)` para ler o histórico em ordem. O ator `system` é gravado como o texto `system`, então um vendedor cujo `sub` do JWT fosse literalmente `system` seria indistinguível na auditoria; aceito o risco porque os tokens são emitidos por script. O mínimo de 1 imagem continua só na aplicação.

### D15 — Migrations: Drizzle como histórico único
- **Escolha:** o SQL do `@nestjs/outbox` (`npx @nestjs/outbox sql --statement-breakpoints`) entra numa migration custom do Drizzle; o store roda com `migrate: false` em todos os ambientes. Dev, testes e produção aplicam o mesmo histórico.
- **Alternativas consideradas:** auto-migração do pacote no boot e CLI do pacote como passo separado — descartadas: dois históricos e ordem dependente do ambiente.
- **Trade-off:** ao atualizar o pacote, preciso gerar uma nova migration com o SQL novo.
- **Na implementação:** o `@nestjs/outbox` está na versão 0.1.4 (pré-1.0), então o SQL fica fixado numa migration nossa (`drizzle/0001_outbox.sql`) e um teste de integração garante que o store inicia com `migrate: false` e falha com `OutboxSchemaError`, em vez de migrar sozinho, num banco sem migrations. `pnpm db:migrate` e `pnpm db:reset` rodam o mesmo histórico; o reset recusa `NODE_ENV=production`.

### D16 — Ciclo de vida e escrita de anúncios (change `listing-lifecycle`)
- **Contexto:** a SPEC define o ciclo de status, mas deixa em aberto qual versão a edição usa como base, o que "arquivar" afeta e como a API trata anúncio de outro vendedor.
- **Escolha:**
  - **Edição parcial (`PATCH`) sobre a versão mais recente**, mesmo `rejected`: `draft` é alterado no lugar; `published`/`rejected` geram nova versão `draft` com as alterações, numa única transação; `in_review`/`archived` respondem `409`. **Motivo (meu):** a versão rejeitada está mais próxima da intenção do vendedor, que só precisa aplicar os ajustes pedidos pela moderação.
  - **Editar e enviar são passos separados:** o `submit` move o rascunho para `in_review` e grava `listing.submitted` no outbox na mesma transação; a publicação é da moderação.
  - **Arquivar o anúncio inteiro:** todas as versões não arquivadas vão para `archived`, com um evento por versão; recusado (`409`) se houver versão `in_review`.
  - **Anúncio de outro vendedor responde `404`**, igual a inexistente.
  - **Validação com zod** na aplicação (mesmo esquema na criação, na edição mesclada e no futuro seed); limites como constantes (`LISTING_LIMITS`), descrição até 5000 caracteres (valor assumido, a SPEC deixou em aberto).
  - **JWT:** guard próprio sobre `@nestjs/jwt`, algoritmo fixo em HS256, `sub` obrigatório; `JWT_SECRET` obrigatório com ≥ 32 caracteres. Script `pnpm auth:token`.
- **Alternativas consideradas:** partir da última versão `published` na edição — descartada (descarta a correção já feita sobre o conteúdo reprovado); arquivar só a versão mais recente — descartada (deixaria uma versão publicada no ar após o pedido de arquivar); `class-validator` e `@nestjs/passport` — descartados (mais dependências e abstração para o que ~20 linhas resolvem); `PUT` com corpo completo — descartado (o caso de uso é corrigir um campo).
- **Divergência:** o nome `pnpm token` planejado pela IA colide com um comando reservado do pnpm (`ERR_PNPM_NOT_IMPLEMENTED`); o script ficou `pnpm auth:token`.
- **Trade-off:** a versão em produção e a nova podem divergir. Uma função de **descartar versão** (voltar a partir da publicada) fica sem decisão, para aprender com o uso. Outro: `JWT_SECRET` obrigatório também para `db:migrate` e para o worker, pois todos validam o mesmo esquema de env.
- **Na implementação:** `submit` e `archiveAll` revalidam o status dentro da transação (com lock), então uma corrida entre a leitura e a escrita vira `409`. Duas edições simultâneas nunca criam duas versões abertas: a que perde ou cai no rascunho recém-criado ou recebe conflito. O edit de rascunho não gera evento de auditoria (a trilha é só de status).

### D17 — Pipeline de moderação (change `moderation-pipeline`)
- **Contexto:** a SPEC define a fila (outbox → BullMQ → worker), mas deixa em aberto como moderar com idempotência, onde ficam o retry e o circuit breaker e como registrar falha definitiva. _Estas escolhas partiram da proposta da IA (design da change); a confirmar com o candidato._
- **Escolha:**
  - **Idempotência no banco:** o resultado é aplicado com `expectedFrom: 'in_review'` sob lock (`FOR UPDATE`) na mesma transação que arquiva a versão anterior; se outro processamento ganhou, a transação inteira é desfeita e o job é descartado.
  - **Retry só no BullMQ** (5 tentativas, backoff exponencial com jitter); a política do `@nestjs/resilience` fica com timeout + circuit breaker e `retry: false`, para não multiplicar tentativas. Só `5xx`/timeout/rede contam para o circuito; `429` e `400` não.
  - **`429` e circuito aberto** pausam o worker (`rateLimit` + `Worker.RateLimitError`) sem gastar tentativa; `400` vira `UnrecoverableError`.
  - **Worker criado à mão** (`new Worker`), não com `@Processor`, porque limite por segundo e concorrência vêm da configuração validada e as opções do decorator são estáticas.
  - **Falha definitiva:** a versão continua `in_review`; evento de auditoria `in_review → in_review` com motivo `moderation_failed` (erro e tentativas em `metadata`); o job fica no set `failed` e `pnpm moderation:reprocess` o reenfileira com as tentativas zeradas.
  - **Fora desta change:** mensagens `listing.published`/`listing.rejected` no outbox e a fila `projection`, que entram em `detail-projection`.
- **Alternativas consideradas:** ler o status e decidir fora da transação — descartada (janela de corrida); novo status ou tabela para falhas — descartada (a auditoria já é a trilha); `@Processor` com `process.env` na carga do módulo — descartada (foge da validação de env).
- **Trade-off:** o estado do circuit breaker é por processo (com mais de um worker, cada um abre o seu); o limite por segundo continua global, via Redis. `removeOnComplete` limitado permite republicar uma mensagem já concluída; o caso de uso idempotente descarta o job extra.

### D18 — Detalhe público e detalhe do dono em endpoints separados (change `listing-queries`)
- **Contexto:** a SPEC original deixava `rejected` público (com motivo) e usava o mesmo endpoint para dono e visitante, com autenticação opcional.
- **Escolha:** `GET /listings/:listingId` é público e só devolve a versão `published` (senão 404, ignorando `Authorization`). `GET /me/listings/:listingId` é autenticado e devolve a versão mais recente em qualquer status, com `rejection_reason`; anúncio de outro vendedor responde 404. Rejeitado deixa de ser público. Rota `/me/...` escolhida entre duas opções propostas (a outra era `/listings/:id/owner`).
- **Alternativas consideradas:** endpoint único com guard opcional e regra por papel (proposta inicial da IA) — descartado para deixar o endpoint público o mais restrito possível, com regra única (publicado ou 404).
- **Trade-off:** o visitante não vê mais anúncios reprovados nem o motivo (divergência do que a SPEC original dizia); em troca, o endpoint público é simples e a projeção no Redis só precisa cobrir `published`.
- **A confirmar:** `limit` acima do máximo → 400 (em vez de reduzir) e padrões de página 20/50 foram propostos pela IA, sem decisão explícita.

### D19 — Projeção do detalhe público no Redis (change `detail-projection`)
- **Contexto:** o detalhe público é a leitura mais frequente por anúncio; com a D18 ele é só a versão `published`.
- **Escolha:** só `listing.published` e `listing.archived` geram mensagem no outbox (mesma transação da mudança de status); reprovar não gera, porque não muda o detalhe público. Um único job idempotente `{ listingId }` (do outbox ou de reconstrução por miss) relê o Postgres e faz `SET` (ou `DEL` se não há versão publicada), com concorrência 1. A API lê do Redis com `commandTimeout` e `enableOfflineQueue: false` e cai para o Postgres em miss, erro ou timeout; só pede reconstrução (`jobId` por anúncio) se o anúncio existe publicado, para ids aleatórios não encherem a fila. O relay e o transport saíram do módulo de moderação para um módulo compartilhado do worker, que roteia por tópico para as filas `moderation` e `projection`.
- **Alternativas consideradas:** tratar cada tópico com lógica própria (aplicar/remover conforme o evento) — descartado: depende da ordem das mensagens. Projetar também o detalhe do dono ou versões reprovadas — descartado: baixa leitura e visibilidade por dono. Métricas de hit/miss — adiadas: ainda não há instrumentação OTel.
- **Trade-off:** consistência eventual (a janela é o intervalo do relay mais o processamento: após publicar uma nova versão ou arquivar, o público pode ver o estado antigo por instantes), em troca de menos carga no banco e de uma leitura que nunca depende do Redis.
- **A confirmar:** validade da chave de 24 h (`DETAIL_CACHE_TTL_SECONDS`, motivo técnico: `noeviction` sem TTL só cresce) e timeout de leitura de 200 ms (`DETAIL_CACHE_TIMEOUT_MS`) foram propostos pela IA, sem decisão explícita.

### D20 — Seed, imagem Docker e observabilidade (chores, sem change)
- **Contexto:** faltavam o seed, a imagem de API/worker e a observabilidade prometidas na SPEC; todos são `chore`, sem regra de negócio nova.
- **Escolha:** (1) o seed é um script que chama a API por HTTP (cria e envia para revisão como um vendedor), então exercita o fluxo real inteiro, e recusa rodar se já houver anúncios publicados (`--force` ignora). (2) Uma imagem única (build multi-stage) para API e worker, com serviços `api`, `worker` e `migrate` atrás do profile `app` do Compose, para não conflitar com `pnpm start:dev` no host. (3) OpenTelemetry ligado só se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido; traços de HTTP, Postgres e Redis; métricas de filas (profundidade por estado), jobs por resultado, latência da chamada à moderação, estado do circuit breaker e outbox, mostradas num único painel provisionado por arquivo. Verifiquei tudo subindo a stack completa: 57 anúncios semeados e publicados, projeção no Redis para os 57, métricas e traços no Grafana.
- **Alternativas consideradas:** seed direto no banco ou pelos casos de uso — descartado: não passaria pela API nem pela fila. Subir API e worker por padrão no Compose — descartado: conflita com o fluxo de desenvolvimento no host (porta 3000). `auto-instrumentations-node` — descartado: instrumentações a mais do que as três de que preciso, e muitas dependências.
- **Trade-off:** o seed depende da API rodando e não é idempotente além da checagem simples; em troca, valida o caminho completo.
- **Débito:** `listing-authoring` e `listing-lifecycle` têm requisitos com mais de 500 caracteres (aviso do `openspec validate --strict`); não alterei o texto deles.

## Débitos técnicos

- **Sem rotina de limpeza do outbox:** não configuramos retenção das mensagens publicadas nem `OutboxInbox.prune()`; dead letters só são expurgadas manualmente (`OutboxDeadLetters.purge`). Em produção: rotina de expurgo por idade.
- **Sem descartar versão:** o vendedor não consegue voltar da versão rejeitada/rascunho para a publicada; decisão adiada de propósito (ver D16).
- **Sem DLQ dedicada:** jobs falhos ficam no set `failed` do BullMQ e são reprocessados por script (ver D6).

## Requisitos ambíguos e interpretações

- **Ambiguidade:** a doc do mock diz que a reprovação vem em `reason`; o servidor responde `rejection_reason`. → **Interpretação:** o adaptador aceita os dois e normaliza. **Por quê:** tratar o mock como serviço externo real, cuja doc pode divergir da implementação.
- **Ambiguidade:** quem vê anúncios fora de `published`? → **Interpretação:** listagem só `published`; detalhe público só para `published` (senão 404); todo o resto, inclusive `rejected` com motivo, só para o dono em endpoint próprio (ver D18). _Revisada: a interpretação inicial tornava `rejected` público._
- **Ambiguidade:** validar no draft ou só no envio para revisão? → **Interpretação:** já no draft, porque o enunciado associa as validações à criação.
- **Ambiguidade:** paginação. → **Interpretação:** `offset`/`limit` com ordenação por `published_at desc`; cursor como evolução (base pequena).
- **Ambiguidade:** onde fica o README da entrega. → **Interpretação:** `backend/implementation/README.md`, com o README da raiz apontando para ele.

## Tempo gasto

Cerca de 5 h de trabalho no registro da timeline (19:02 → 00:00 em 16/11/2026, com pausas; valor aproximado).

## O que faria diferente com mais tempo

- BFF com HMAC entre BFF e backend.
- Projeção de leitura da listagem (ex.: materialized view ou tabela dedicada) e paginação por cursor.
- Teste A/B sobre versões de anúncio.
- DLQ como fila dedicada, Jaeger e Prometheus dedicados.
