# Relatório de execução

Linha do tempo resumida do desenvolvimento: pedidos, decisões, divergências com a IA, descartes e marcos.
Horários no fuso local. Detalhes das decisões em [DECISIONS.md](DECISIONS.md); uso de IA em [AI_USAGE.md](AI_USAGE.md).

## 2026-11-16

- `19:02` **pedido** — Refinar SPEC.md, levantar ambiguidades, criar AGENTS.md e planejar tarefas do primeiro commit
- `19:04` **validacao** — Leitura do server.js do mock: resposta usa rejection_reason (doc diz reason); 20% de 500, 5 rps, latência 100–2000ms; seed de 57 anúncios todos aprovariam e não têm imagens
- `19:04` **proposta** — IA sugeriu reduzir escopo (BFF, MV, versionamento append-only, Grafana) frente ao esforço de 4–6h; aguardando decisão
- `19:04` **marco** — AGENTS.md inicial criado na raiz
- `19:32` **decisao** — D1 — escopo: essencial + OTel mínimo + Grafana da fila; Jaeger/Prometheus fora; BFF, projeção da listagem e A/B como evolução
- `19:34` **decisao** — D2–D4, D6, D8–D10 — versões append-only, preço em centavos, validação estática no draft, falha mantém in_review, JWT, Drizzle, pnpm/Jest/Testcontainers
- `19:34` **decisao** — D5 — outbox + BullMQ para moderação (detalhes da fila em refinamento)
- `19:34` **divergencia** — D7 — IA sugeriu índice parcial/tabela de projeção; usuário escolheu projeção do detalhe no Redis via outbox com timeout e fallback para o banco
- `19:34` **ambiguidade** — Doc do mock (reason) x servidor (rejection_reason); visibilidade por status; validação no draft; README em backend/implementation
- `19:34` **marco** — SPEC.md refinada, AGENTS.md atualizado, CLAUDE.md criado
- `19:50` **decisao** — D5 — fila refinada: polling do outbox com SKIP LOCKED, jobId = outbox.id, retry 5x, 429/breaker pausam worker
- `19:51` **decisao** — D7 — miss no Redis enfileira reconstrução deduplicada por listing_id; projection worker único escritor
- `19:51` **decisao** — D11 — API e worker em processos separados, mesma imagem
- `19:51` **decisao** — D12 — observabilidade com grafana/otel-lgtm
- `19:51` **decisao** — Débito técnico: outbox sem limpeza; D3 motivo do bigint confirmado (performance e arredondamento)
- `19:51` **descarte** — D9 — removida a citação de TypeORM como escolha provável em produção; ORM seria revisto com RFC
- `19:51` **marco** — Desenho da fila e observabilidade fechados na SPEC
- `19:54` **marco** — Commit 1/4: docs (spec, AGENTS, CLAUDE, entregáveis)
- `19:57` **validacao** — Scaffold do Nest 12 + docs oficiais: ESM puro, Vitest e oxlint por padrão; pacotes @nestjs/outbox, @nestjs/resilience, @nestjs/drizzle; instrumentação OTel do Nest ainda sem suporte ao v12
- `19:57` **correcao-ia** — D10 — IA afirmou que Jest é o padrão do NestJS; no Nest 12 o padrão é Vitest (conhecimento desatualizado)
- `19:57` **proposta** — IA sugeriu Vitest, @nestjs/outbox com transporte BullMQ e @nestjs/resilience no lugar de outbox próprio e opossum; aguardando decisão
- `20:00` **decisao** — D5/D10/D12 — Vitest, oxlint, @nestjs/outbox com transporte BullMQ, @nestjs/resilience; OTel + otel-lgtm mantidos (Observe descartado por ser SaaS)
- `20:02` **validacao** — Bootstrap: typecheck, oxlint, 3 testes unitários (config), 1 e2e (/health), build e smoke test de API (/health, /docs) e worker sob Node 22.17
- `20:02` **marco** — Commit 2/5: docs do Nest 12; commit 3/5: bootstrap NestJS
- `20:06` **validacao** — Compose: postgres 18, redis 8.8 (noeviction), mock e otel-lgtm 0.40 saudáveis; mock confirmou rejection_reason e 429 forçado
- `20:06` **marco** — Commit 4/5: infraestrutura local
- `20:06` **marco** — Commit 5/5: openspec init (Claude Code, artefatos em pt-BR)
- `21:25` **pedido** — Planejar todas as changes do OpenSpec antes de implementar
- `21:25` **proposta** — IA sugeriu 4 changes (lifecycle, moderation-pipeline, queries, projection), só proposal.md por ora; moderação antes da leitura; observabilidade/seed/README como chore
- `21:41` **divergencia** — D13 — IA propôs 4 changes; usuário separou modelagem/migrations em change própria (listing-data-model) para maior qualidade nessas decisões
- `21:42` **decisao** — D13 — 5 changes só com proposal.md; design e tasks detalhados na hora de implementar cada uma
- `21:42` **marco** — Commit 6: cinco changes do OpenSpec (só proposals)
- `21:57` **decisao** — listing-data-model — versão ativa (published) garantida por índice único parcial no banco, em vez de controle transacional na aplicação
- `21:58` **trade-off** — listing-data-model — imagens por versão: tabela filha copiada por versão x jsonb na versão x tabela compartilhada; em análise
- `22:02` **decisao** — listing-data-model — imagens em tabela filha por versão (listing_images), copiadas ao criar nova versão; B (compartilhada) descartada por quebrar imutabilidade; jsonb descartado. Mínimo de 1 imagem fica na aplicação (risco conhecido). Motivo da escolha de A sobre jsonb: a confirmar
- `22:07` **decisao** — listing-data-model — PK composta (listing_id, version) em listings; FKs compostas em images e audit; sem tabela própria de listing_id
- `22:07` **decisao** — listing-data-model — segundo índice único parcial: no máximo uma versão aberta (draft/in_review) por listing_id; UNIQUE(listing_id, version) via PK
- `22:10` **decisao** — listing-data-model — auditoria escrita pela aplicação na mesma transação (não trigger); motivo: será enriquecida no futuro com metadados vindos da API; prever coluna metadata jsonb
- `22:13` **decisao** — D15 — migrations: SQL do @nestjs/outbox dentro de migration custom do Drizzle; migrate=false no store em todos os ambientes
- `22:13` **divergencia** — D14 — IA propôs CHECK de 10–100 no título no banco; usuário recusou para controlar o limite por config sem migration (preço > 0 no banco mantido)
- `22:15` **decisao** — D14 — máximo de imagens fora do banco (só position >= 0 e PK composta); limite configurável na aplicação
- `22:25` **marco** — listing-data-model: specs (listing-versioning, listing-audit) e design.md escritos; openspec validate --strict ok; tasks ainda não criadas
- `22:17` **validacao** — Design verificado contra o instalado: drizzle-orm 0.45.4 suporta índice parcial/PK e FK compostas/CHECK/generate --custom; @nestjs/outbox 0.1.4 'sql' gera o schema nest_outbox (messages, dead_letters, inbox, migrations)
- `22:21` **marco** — listing-data-model: tasks.md gerado (6 grupos, 22 tasks); change pronta para /opsx:apply
- `22:22` **pedido** — Implementar listing-data-model (/opsx:apply)
- `22:25` **validacao** — listing-data-model grupos 1–3: 25 testes de integração (Testcontainers) passam; mutation check — sem os índices parciais 4 testes de invariante falham
- `22:29` **marco** — listing-data-model grupos 4–5: migration do outbox, repositório Drizzle (porta, adaptador, erros) e testes de auditoria/repositório; 47 testes de integração passam
- `22:31` **correcao-ia** — migration do outbox: comando 'outbox' inexistente (bin é nest-outbox) sobrescreveu o arquivo; detectado ao inspecionar e regenerado
- `22:31` **marco** — listing-data-model: 22/22 tasks concluídas; suíte completa verde (10 unit, 1 e2e, 48 int), build ok, openspec validate --strict ok
- `22:34` **decisao** — Convenção de commits: um único commit por change do OpenSpec, reunindo planejamento (proposal/specs/design/tasks) e implementação; motivo: a confirmar
- `22:34` **marco** — Commit 7: change listing-data-model (planejamento + implementação)
- `22:42` **marco** — listing-data-model arquivada (2026-11-16); specs listing-versioning e listing-audit promovidas a openspec/specs/
- `22:44` **decisao** — Convenção: arquivamento da change em commit próprio (chore), separado do commit de planejamento+implementação; motivo: a confirmar
- `22:44` **marco** — Commit 8: arquivamento da listing-data-model
