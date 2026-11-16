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
