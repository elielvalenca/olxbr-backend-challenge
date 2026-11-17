# Design

## Context

O projeto tem Postgres 18 (Compose) e NestJS 12 sem camada de dados. Ver `proposal.md` para a motivação. Restrições que moldam o desenho:

- O anúncio é append-only por versão (`SPEC.md`), e quero que as invariantes críticas fiquem no banco, em vez de depender de locks e tratamento de corridas na aplicação.
- Regras de negócio que mudam com frequência (tamanho do título, número máximo de imagens) devem ser ajustáveis por configuração, sem migration.
- O outbox (`@nestjs/outbox`) grava no schema próprio `nest_outbox`, na mesma transação das mudanças de status. Esta change só prepara o schema; o uso fica para as changes seguintes.
- Verificado durante o design: o Drizzle instalado (`drizzle-orm` 0.45.4 / `drizzle-kit` 0.31) suporta índice único parcial (`.where()`), PK e FK compostas, `CHECK` e `generate --custom`; o comando `@nestjs/outbox sql --statement-breakpoints` (0.1.4) gera o SQL do schema `nest_outbox` a partir da versão 0.

## Goals / Non-Goals

**Goals:**
- Modelo físico das três tabelas, com invariantes de unicidade garantidas pelo banco.
- Histórico único de migrations (Drizzle), incluindo o schema do outbox.
- Acesso a dados utilizável pelos casos de uso: módulo Drizzle, tipo de transação e scripts de migrate e reset.

**Non-Goals:**
- Regras de transição de status, validações de negócio e endpoints (`listing-lifecycle`).
- Fila, relay e worker (`moderation-pipeline`), consultas públicas (`listing-queries`) e projeção (`detail-projection`).
- Particionamento, retenção e limpeza de dados.

## Decisions

### 1. `listings`: uma linha por versão, PK composta

```
listings
  listing_id        uuid        -- gerado pela aplicação (UUID v4), sem tabela própria
  version           integer
  seller_id         text        -- sub do JWT
  title             text        -- sem CHECK de tamanho (config na aplicação)
  description       text
  price_cents       bigint      CHECK (price_cents > 0)
  category          text
  status            text        CHECK (status IN ('draft','in_review','rejected','published','archived'))
  rejection_reason  text        -- livre; preenchido quando status = 'rejected'
  created_at, submitted_at, published_at, updated_at   timestamptz (os três últimos opcionais)
  PRIMARY KEY (listing_id, version)
```

- **Por que a PK composta:** o par já é a identidade usada no job da fila (`{listingId, version}`), na auditoria e na invalidação do Redis. Um `id` surrogate criaria um segundo identificador sem uso. O custo é o join por duas colunas, irrelevante no volume esperado.
- **Alternativa descartada:** tabela `listing_identities` como pai das versões. Dá uma FK para o `listing_id`, mas só ganharíamos uma tabela sem atributos próprios.
- **`category` como `text` sem `CHECK`:** a lista de categorias é regra do mock/aplicação e pode evoluir, pelo mesmo critério do título.
- **`status` como `text` com `CHECK`, e não enum do Postgres:** alterar um enum exige `ALTER TYPE` com restrições de uso na mesma transação. O conjunto de status faz parte do contrato do domínio e muda raramente, então o `CHECK` é uma garantia útil e simples de migrar.

### 2. Dois índices únicos parciais para as invariantes

```
CREATE UNIQUE INDEX listings_one_published  ON listings (listing_id) WHERE status = 'published';
CREATE UNIQUE INDEX listings_one_open       ON listings (listing_id) WHERE status IN ('draft','in_review');
```

- **Por que no banco:** a aplicação não precisa de `SELECT … FOR UPDATE` nem de lock para evitar duas versões publicadas ou dois rascunhos. A corrida vira um `unique_violation` (SQLSTATE `23505`), que o chamador trata (erro de negócio para o vendedor na edição; retry e idempotência no worker de moderação).
- **Sem `is_current`:** a invariante deriva do `status`, então não há segunda coluna que possa divergir.
- **Consequência de ordem:** índice parcial não é `DEFERRABLE`, e o Postgres o checa a cada comando. A publicação precisa arquivar a versão anterior **antes** de publicar a nova, dentro da mesma transação. Isso é um requisito do caso de uso (ver spec `listing-versioning`) e precisa de teste de integração.
- **Alternativa descartada:** `EXCLUDE` constraint com `WHERE`. Exigiria a extensão `btree_gist` para um caso que o índice único resolve.

### 3. `listing_images`: tabela filha por versão, copiada na nova versão

```
listing_images
  listing_id, version        -- FK composta -> listings (listing_id, version) ON DELETE CASCADE
  position   integer         CHECK (position >= 0)
  url        text
  PRIMARY KEY (listing_id, version, position)
```

- **Por que por versão:** imagens compartilhadas por `listing_id` fariam a edição do rascunho alterar o anúncio publicado. A cópia (`INSERT … SELECT`, até ~10 linhas) preserva a imutabilidade.
- **Alternativa descartada:** `jsonb` na versão. Garantiria no banco o mínimo de 1 imagem, mas fecha o formato: a SPEC prevê que as URLs virem chaves de S3 com metadados por imagem, o que exigiria migrar dados. _O motivo da preferência pela tabela filha é uma escolha minha; a confirmar com quem decide._
- **Sem limite máximo no banco:** a PK `(listing_id, version, position)` garante unicidade e ordem. O máximo de 10 fica em configuração e é validado na aplicação, pelo mesmo critério do título.
- **Mínimo de 1 imagem fica só na aplicação.** O banco não tem como exigir "ao menos uma linha filha" sem trigger. Mitigação nos Riscos.

### 4. `listing_audit_events`: append-only, escrita pela aplicação

```
listing_audit_events
  id            bigint GENERATED ALWAYS AS IDENTITY  PRIMARY KEY
  listing_id, version                                -- FK composta -> listings
  from_status   text NULL                            -- nulo na criação
  to_status     text NOT NULL
  actor         text NOT NULL                        -- seller_id ou 'system'
  reason        text NULL
  metadata      jsonb NULL                           -- enriquecimento futuro com dados da API
  occurred_at   timestamptz NOT NULL DEFAULT now()
```

- **Aplicação, não trigger:** o evento precisa de ator, motivo e metadados da API, que só o caso de uso conhece; um trigger exigiria passar esse contexto por variáveis de sessão em toda transação e esconderia a lógica no banco. A garantia fica concentrada em **um único método de transição** que muda o status e grava o evento na mesma transação, coberto por teste.
- **`ON DELETE` na FK:** a auditoria referencia a versão sem cascade, porque a trilha não deve desaparecer com ela (a aplicação não apaga versões).
- **`jsonb` para `metadata`:** formato ainda desconhecido e sem consulta por campo, então o formato livre faz sentido aqui.

### 5. Índices para as leituras previstas

- `listings (category, published_at DESC) WHERE status = 'published'`: listagem pública com filtro por categoria.
- `listings (published_at DESC) WHERE status = 'published'`: listagem sem filtro.
- `listings (seller_id, listing_id)`: versões de um dono.
- Os índices únicos parciais da decisão 2 já cobrem a busca da versão publicada e da aberta por `listing_id`.

### 6. Migrations: Drizzle como histórico único

- Schema declarado em TypeScript; `drizzle-kit generate` produz as migrations em `drizzle/`, versionadas no git.
- O SQL do outbox entra numa migration custom (`drizzle-kit generate --custom --name=outbox`), preenchida com `@nestjs/outbox sql --statement-breakpoints`. O `PostgresOutboxStore` roda com `migrate: false` em todos os ambientes, então dev, testes e produção aplicam o mesmo histórico.
- `nest_outbox` fica fora do schema do Drizzle; o `drizzle-kit` trabalha no schema `public` e não o toca.
- Os índices parciais e os `CHECK` saem do `generate`; o resultado é revisado à mão antes do commit.
- **Alternativas descartadas:** auto-migração do pacote no boot e a CLI do pacote como passo separado. Ambas criam dois históricos e dependem do ambiente.

### 7. Camada de acesso a dados

- Módulo Drizzle (`@nestjs/drizzle` com driver `pg`), conexão por `DATABASE_URL` validada na config.
- Os casos de uso recebem a transação por uma porta de repositório (`ListingRepository`), mantendo o domínio sem importar o ORM. O repositório expõe operações de intenção (criar versão, mudar status com evento), em vez de CRUD genérico.
- Scripts `pnpm db:migrate` e `pnpm db:reset` (limpar ambiente), via CLI do Nest, conforme a SPEC.

## Risks / Trade-offs

- **[Versão sem imagem, já que o mínimo de 1 não é garantido pelo banco]** → um único método do repositório cria versão e imagens na mesma transação, com teste de integração; a validação de domínio recusa lista vazia antes de persistir.
- **[Esquecer o evento de auditoria numa transição]** → só existe um método de transição que grava o evento; nenhum código atualiza `status` por outro caminho (revisão de código e teste).
- **[Ordem arquivar-depois-publicar]** → violar a ordem causa `unique_violation` em vez de dados inconsistentes; teste de integração cobre a troca atômica e a corrida entre dois publicadores.
- **[`@nestjs/outbox` é versão 0.x]** → o SQL é fixado numa migration nossa, então um upgrade do pacote não altera o banco sozinho; atualizar exige uma nova migration revisada.
- **[`CHECK` de status exige migration para novo status]** → aceito; novos status são mudança de domínio e merecem migration revisada.
- **[Crescimento do histórico de versões]** → sem retenção nesta versão; registrado como débito técnico.

## Migration Plan

1. Declarar o schema Drizzle e gerar a migration inicial (`public`); revisar o SQL gerado.
2. Gerar a migration custom do outbox com o SQL do pacote.
3. `pnpm db:migrate` aplica tudo, e os testes de integração (Testcontainers) usam o mesmo comando.
4. Rollback: o ambiente é descartável (`pnpm db:reset`). Não há dados de produção, e o outbox não tem migrations de volta.

## Open Questions

- Geração do `listing_id`: UUID v4 do Node (`crypto.randomUUID`), adotado por padrão; o v7 só melhoraria a localidade do índice, o que não importa nesse volume. Reavaliável sem mudar specs.
- Estratégia exata do `db:reset` (`DROP SCHEMA` e re-migrate, ou truncate) e a ordem dos nomes das migrations; decidido na implementação.
