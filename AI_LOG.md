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
