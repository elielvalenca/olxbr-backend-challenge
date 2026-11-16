# AGENTS.md

Guia para agentes de IA (e pessoas) que trabalham neste repositório. Mantenha este arquivo curto e atualizado: quando uma decisão mudar, atualize aqui e registre em `DECISIONS.md`.

## Contexto

Desafio técnico de backend do Grupo OLX: serviço de **inserção e listagem de anúncios** com **moderação automática** via API externa (mock).

| Caminho | Conteúdo |
| --- | --- |
| `README.md` | Regras do desafio e critérios de avaliação (não editar o conteúdo original) |
| `backend/README.md` | Enunciado da trilha de backend |
| `backend/api-mock/` | Mock da API de moderação. **Não alterar** — é tratado como serviço externo |
| `backend/implementation/` | Nossa implementação (todo código novo fica aqui) |
| `backend/implementation/SPEC.md` | Especificação refinada (escopo, status, visibilidade, validações) |
| `backend/implementation/README.md` | README da entrega: como rodar, arquitetura, contrato da API |
| `DECISIONS.md`, `AI_USAGE.md`, `AI_LOG.md` | Entregáveis de documentação (mantidos pela skill `registro-entrega`) |

## Princípios (leia antes de propor qualquer coisa)

- **Proporcionalidade.** O desafio estima 4–6h de esforço e avalia explicitamente "solução proporcional ao problema, sem código ou abstrações sobrando". Prefira o caminho mais simples que atende ao requisito. Toda peça de infraestrutura precisa de uma justificativa registrada.
- **Resolver bem o essencial primeiro:** criar, listar (paginação + filtro por categoria), detalhar e moderar anúncios. Extras só depois do essencial estar testado.
- **O candidato precisa explicar cada linha.** Não gere código "mágico" ou difícil de defender numa apresentação ao vivo.
- **Não invente motivos.** Se uma decisão foi tomada sem justificativa explícita, pergunte.

## Stack

Node 22 (ver `.nvmrc`), pnpm, NestJS, PostgreSQL + Drizzle, Redis (BullMQ + projeção do detalhe), JWT, Swagger (OpenAPI), OpenTelemetry mínimo exportando para `grafana/otel-lgtm` (só painel da fila), Vitest + Testcontainers, oxlint + Prettier, `@nestjs/outbox`, `@nestjs/resilience`, Docker Compose.

API e worker são processos separados (mesma imagem, entrypoints `main.ts` e `worker.ts`). O desenho da fila (outbox, relay, `moderation`, `projection`) está em `backend/implementation/SPEC.md`.

Fora do escopo (só documentados como evolução): BFF/HMAC, Jaeger, Prometheus dedicado, projeção da listagem, teste A/B. Não adicione sem decisão registrada em `DECISIONS.md`.

## NestJS 12

A versão do NestJS é provavelmente mais nova que o seu conhecimento. Consulte https://docs.nestjs.com/llms.txt antes de assumir APIs. O projeto é **ESM puro**: imports relativos terminam em `.js`, sem `__dirname` (use `import.meta.dirname`), testes com Vitest (`vi.fn()`, não `jest.fn()`). Antes de escrever infraestrutura própria, verifique se há pacote oficial (`@nestjs/outbox`, `@nestjs/resilience`, `@nestjs/drizzle`, `@nestjs/bullmq`, `@nestjs/terminus`).

## Arquitetura

Hexagonal, de forma pragmática:

```
src/
  modules/listings/
    domain/          # entidades, value objects, regras de transição de status — sem NestJS, sem I/O
    application/     # casos de uso + portas (interfaces) que eles consomem
    infrastructure/  # adaptadores: repositório Postgres, cliente HTTP de moderação, fila BullMQ
    http/            # controllers, DTOs, Swagger
  shared/            # config, auth, observabilidade
```

- `domain/` não importa nada de `@nestjs/*`, ORM, fila ou HTTP.
- Crie uma porta só quando houver um adaptador real do outro lado (ex.: `ModerationGateway`, `ListingRepository`). Nada de interface para tudo.
- Controllers são finos: validam entrada, chamam o caso de uso, mapeiam a saída.

## Domínio: ciclo de vida do anúncio

Status: `draft` → `in_review` → `published` | `rejected`; qualquer versão pode ir para `archived`.

- Anúncio nasce `draft`. Um endpoint dedicado envia para revisão (`in_review`).
- Só a moderação move `in_review` → `published`/`rejected`.
- `rejected` é **resultado de negócio** (com `rejection_reason` visível). Falhas de integração **nunca** viram `rejected`: o anúncio permanece `in_review`, a falha é registrada e há script de reprocessamento.
- Versões append-only: `draft` é editável no lugar; editar `published`/`rejected` cria nova versão `draft`; publicar uma nova versão arquiva a anterior.
- Preço sempre em centavos (`bigint`). Sem validar faixa de preço por categoria — isso é da moderação.
- Transições válidas ficam no domínio, com teste unitário. Toda transição gera um evento em `listing_audit_events` e, quando relevante, uma mensagem no outbox (`outbox.add(tx, …)`) na mesma transação.
- Detalhes completos (tabela de transições, visibilidade, validações) em `backend/implementation/SPEC.md`.

## Integração com a moderação (mock)

Contrato em `backend/api-mock/docs-candidato/API.md`, mas **o código do mock é a fonte da verdade**. Divergências conhecidas:

- A doc diz que a reprovação vem em `reason`; o servidor responde `rejection_reason`. O adaptador deve aceitar ambos.
- ~20% das chamadas retornam `500` (`ERROR_RATE`), limite de 5 req/s com `429` + `Retry-After`, latência de 100–2000 ms.
- `400` (payload inválido) não é recuperável por retry → DLQ direto.
- Header `x-mock-force: error | rate-limit` força falhas — use nos testes de integração.

Regras do adaptador: timeout explícito, retry com backoff só para erros transitórios (`5xx`, `429`, timeout), respeitar `Retry-After`, circuit breaker, limitador de taxa no consumidor, processamento idempotente (ignorar resultado se o anúncio já não estiver `in_review` naquela versão).

## Convenções

- Código, identificadores, rotas e nomes de tabelas em **inglês**; status em `snake_case` (`in_review`).
- Documentação, ADRs e mensagens de commit em **português**.
- Commits no padrão Conventional Commits em português (`feat: ...`, `chore: ...`, `docs: ...`), pequenos e incrementais — o histórico é avaliado.
- Segredos só em `.env` (fora do git); mantenha `.env.example` atualizado.

## Testes

- Unitários: regras de domínio (validações, transições de status) e classificação de erros do adaptador de moderação.
- Integração (Vitest + Testcontainers): fluxo criar → enviar para revisão → worker → `published`/`rejected`, com Postgres/Redis reais e o mock forçando falhas.
- Teste comportamento, não implementação. Escolha o que testar pelo risco.

## OpenSpec

Use OpenSpec para mudanças de **regra de negócio ou nova capacidade**. Não é necessário para correções de bug ou tarefas de infraestrutura (`chore`).

## Registro de entregáveis

Em toda interação com decisão, divergência, descarte, ambiguidade, correção de algo gerado pela IA, validação ou marco, use a skill `registro-entrega` (`.claude/skills/registro-entrega/`). A timeline é escrita **sempre** via `scripts/log.sh`.

## Comandos

Em `backend/implementation/`, com Node 22 (`nvm use`):

| Comando | O que faz |
| --- | --- |
| `cp .env.example .env` | Configuração local |
| `docker compose up -d --wait` | Postgres, Redis, mock da moderação (`:8787`) e Grafana/OTel (`:3001`) |
| `pnpm install` | Instala dependências |
| `pnpm start:dev` / `pnpm start:worker:dev` | API (Swagger em `/docs`) / worker, em modo watch |
| `pnpm build` | Compila para `dist/` (`main.js` e `worker.js`) |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Tipos, oxlint, Prettier |
| `pnpm test` · `pnpm test:e2e` | Unitários (`*.spec.ts`) · e2e (`test/*.e2e-spec.ts`) |

_A completar: seed, gerar JWT, reprocessar jobs falhos._
