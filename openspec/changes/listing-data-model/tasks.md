# Tasks

Todas as tasks rodam em `backend/implementation/` com Node 22. Os testes de integração usam Testcontainers (Postgres real) e ficam em `*.int-spec.ts`.

## 1. Dependências e acesso a dados

- [x] 1.1 Adicionar `drizzle-orm`, `pg`, `@nestjs/drizzle` e, como dev, `drizzle-kit`, `@types/pg` e `@testcontainers/postgresql`; verificar com `pnpm install`, `pnpm typecheck` e `pnpm build`.
- [x] 1.2 Incluir `DATABASE_URL` no schema de env (obrigatória, URL válida) e cobrir com teste unitário o erro de boot quando ausente ou inválida; verificar com `pnpm test`.
- [x] 1.3 Criar o módulo de banco em `src/shared/database/` (conexão `pg` via `DATABASE_URL`, tipo `Database` e tipo da transação) e importá-lo em `AppModule` e `WorkerModule`; verificar com `pnpm test:e2e` (o `/health` continua respondendo) usando o Postgres do Compose.
- [x] 1.4 Criar `drizzle.config.ts` (schema, pasta `drizzle/`, dialeto `postgresql`) e a função de aplicar migrations reutilizada pelo script e pelos testes; verificar com `pnpm drizzle-kit check`.

## 2. Infra de testes de integração

- [x] 2.1 Criar um helper que sobe um Postgres 18 via Testcontainers, aplica as migrations e devolve `Database` e a função de encerramento; verificar com um teste de fumaça `SELECT 1`.
- [x] 2.2 Adicionar o script `pnpm test:int` e o `vitest.config.int.ts` (`*.int-spec.ts`, timeout maior, sem paralelismo entre arquivos); verificar rodando o teste de fumaça por ele.

## 3. Schema de `listings` e invariantes (spec `listing-versioning`)

- [x] 3.1 Declarar `listings` em `src/modules/listings/infrastructure/schema.ts`: PK `(listing_id, version)`, `price_cents bigint CHECK (> 0)`, `status text CHECK` nos cinco valores, `category` e `title` sem restrição de tamanho ou domínio, `rejection_reason` livre, timestamps `timestamptz`; verificar com `pnpm typecheck`.
- [x] 3.2 Declarar os dois índices únicos parciais (`published` e `draft`/`in_review`) e os índices de leitura da decisão 5 do design; verificar com `pnpm typecheck`.
- [x] 3.3 Declarar `listing_images` (PK `(listing_id, version, position)`, `position >= 0`, FK composta com `ON DELETE CASCADE`) e `listing_audit_events` (identity, FK composta sem cascade, `from_status` nulo, `actor`, `reason`, `metadata jsonb`, `occurred_at`); verificar com `pnpm typecheck`.
- [x] 3.4 Gerar a migration inicial com `drizzle-kit generate`, revisar o SQL à mão (índices parciais, `CHECK`s, FKs) e aplicá-lo ao Postgres do Compose; verificar inspecionando as tabelas e índices com `psql \d`.
- [x] 3.5 Escrever os testes de integração dos requisitos de `listing-versioning`: versão repetida, segunda versão publicada rejeitada, publicações concorrentes, anúncios distintos, segundo rascunho, nova versão após rejeição, status desconhecido, motivo livre, preço ≤ 0, round-trip de centavos, título de qualquer tamanho aceito; verificar com `pnpm test:int`.
- [x] 3.6 Escrever os testes de integração de imagens: posição repetida, imagem sem versão, leitura em ordem de posição, mais de 10 imagens aceitas pelo banco; verificar com `pnpm test:int`.

## 4. Migration do outbox

- [x] 4.1 Gerar a migration custom com `drizzle-kit generate --custom --name=outbox` e preenchê-la com a saída de `@nestjs/outbox sql --statement-breakpoints` (versão do pacote fixada em comentário no topo); verificar aplicando-a e conferindo `nest_outbox.messages`, `dead_letters`, `inbox` e `migrations`.
- [x] 4.2 Escrever um teste de integração garantindo que, após o `migrate` do Drizzle, o schema `nest_outbox` existe e o `PostgresOutboxStore` inicia com `migrate: false` sem tentar migrar; verificar com `pnpm test:int`.

## 5. Repositório e auditoria (spec `listing-audit`)

- [x] 5.1 Definir em `domain/` os tipos de status e de ator e, em `application/`, a porta `ListingRepository` com operações de intenção: criar versão inicial, criar nova versão a partir de outra (copiando imagens), mudar status com evento e publicar substituindo a versão anterior; verificar com `pnpm typecheck` e lint sem importar ORM no domínio.
- [x] 5.2 Implementar o adaptador Drizzle da porta em `infrastructure/`, com a mudança de status e o evento de auditoria numa única transação e a publicação arquivando a versão anterior antes de publicar a nova; verificar com `pnpm typecheck`.
- [x] 5.3 Escrever os testes de integração de auditoria: evento na criação (sem origem), reprovação com motivo, rollback sem evento, ator vendedor e sistema, histórico em ordem, evento para versão inexistente rejeitado, metadados opcionais; verificar com `pnpm test:int`.
- [x] 5.4 Escrever os testes de integração do repositório: troca atômica da versão publicada, publicação concorrente (uma conclui, a outra falha com `23505`), edição concorrente (uma conclui), cópia de imagens na nova versão e isolamento entre versões; verificar com `pnpm test:int`.

## 6. Scripts e documentação

- [x] 6.1 Adicionar `pnpm db:migrate` e `pnpm db:reset` (`DROP SCHEMA` de `public` e `nest_outbox` seguido de migrate; recusa rodar com `NODE_ENV=production`); verificar rodando ambos no Postgres do Compose e conferindo as tabelas.
- [x] 6.2 Documentar o modelo de dados e os comandos de banco em `backend/implementation/README.md` e atualizar a tabela de comandos do `AGENTS.md`; verificar executando os comandos documentados a partir de um clone limpo.
- [x] 6.3 Atualizar o `DECISIONS.md` (D14 e D15 com o que mudou na implementação, incluindo o motivo da escolha de imagens em tabela filha, se confirmado) e registrar a validação no `AI_USAGE.md`; verificar relendo as seções.
- [x] 6.4 Rodar a suíte completa (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm test:int`) e `openspec validate listing-data-model --strict`; verificar que tudo passa.

## Workflow follow-up

- Arquivar a change (`/opsx:archive`) depois da revisão, para promover as specs `listing-versioning` e `listing-audit` a `openspec/specs/`.
