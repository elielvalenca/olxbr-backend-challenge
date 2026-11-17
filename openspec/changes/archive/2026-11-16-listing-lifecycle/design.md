# Design

## Context

Motivação em `proposal.md`. A `listing-data-model` já entregou o schema, o `ListingRepository` (`createFirstVersion`, `createNextVersion`, `transition`, `publishReplacing`), os erros `ListingVersionNotFoundError`/`ListingVersionConflictError` e o módulo de banco. Falta o que está acima do repositório: regras de domínio, validação, casos de uso, HTTP e autenticação.

Estado atual relevante:
- `AppModule` só tem config, banco e `/health`; não há `ListingsModule`, auth, validação de entrada nem filtro de erros.
- `zod` já é usado para o env. `@nestjs/outbox` 0.1.4 está instalado (`Outbox<Tx>.add(tx, { topic, payload, … })`), mas ainda não está registrado em nenhum módulo; as migrations dele já existem.
- A porta não tem leitura nem edição de rascunho no lugar: precisa crescer.

## Goals / Non-Goals

**Goals:**
- Regras de transição e de conteúdo no domínio, testáveis sem I/O.
- Quatro casos de uso de escrita, finos, sobre uma porta de repositório pequena.
- JWT HS256 simples, com script de emissão.

**Non-Goals:**
- Consumir a mensagem do outbox, relay, fila e moderação (`moderation-pipeline`). Aqui só se grava `listing.submitted`.
- Mensagens `listing.archived` e demais eventos da projeção (`detail-projection`); o arquivamento só grava status e auditoria.
- Leituras públicas e detalhe (`listing-queries`). Os endpoints de escrita devolvem só `{ listingId, version, status }`.
- Cadastro, refresh token, papéis ou rotação de segredo.

## Decisions

### 1. Transições como tabela no domínio

`domain/listing-status.ts` ganha uma tabela `TRANSITIONS: Record<ListingStatus, ListingStatus[]>` e `assertTransition(from, to)`, que lança `InvalidTransitionError`. Os casos de uso chamam `assertTransition` antes de qualquer escrita; o repositório continua sem opinião sobre validade (como já documentado na porta).

- **Por quê:** é a regra de negócio mais citada e o teste unitário cobre a matriz inteira (5×5) em poucas linhas.
- **Descartado:** máquina de estados com biblioteca ou classes por estado, que seria abstração demais para cinco status.
- A tabela representa só as transições de `status`. "Editar `published`/`rejected` cria nova versão" não é transição de status: é `createNextVersion` (nasce `draft`), regra do caso de uso de edição.

### 2. Validação com zod na camada de aplicação, não em class-validator

Um esquema zod (`application/listing-content.ts`) valida o conteúdo: título com `trim` e 10–100, descrição `trim` não vazia, preço inteiro seguro > 0, categoria em enum, 1–10 URLs `https`. Uma versão `partial()` com ao menos um campo serve à edição.

- **Por quê:** o mesmo esquema vale para criação, edição (validando o conteúdo mesclado) e para o futuro seed. O projeto já usa zod. Evita decoradores duplicados nos DTOs.
- **Limites como constantes** num único arquivo (`LISTING_LIMITS`), não variáveis de ambiente: o D14 pediu que não fiquem no banco, e ajustá-los por deploy é suficiente. Promover a env é trivial se surgir necessidade.
- **Preço:** `z.number().int().positive().max(Number.MAX_SAFE_INTEGER)`. O repositório usa `bigint` em modo `number`; acima de 2^53 perderia precisão, e R$ 90 trilhões já é inválido na prática.
- **Erros → 400:** um pipe de validação zod no controller converte a falha em `BadRequestException` com a lista de `{ field, message }`.
- **Descartado:** `class-validator` + `class-transformer` (mais dependências e DTOs paralelos aos tipos) e `nestjs-zod` (mais um pacote para pouca coisa; o pipe próprio tem ~15 linhas). O Swagger fica por conta de DTOs simples com `@ApiProperty` apenas para documentação.

### 3. Porta do repositório: três métodos novos e um estendido

```
findLatest(listingId): Promise<{ ref, sellerId, status, content } | null>   // versão mais recente
updateDraft(ref, content, actor?): Promise<void>                            // edição no lugar
createNextVersion(from, actor, content?): Promise<VersionRef>               // content sobrepõe a cópia
submit(ref, actor): Promise<void>                                           // draft → in_review + outbox
archiveAll(listingId, actor): Promise<void>                                 // todas não arquivadas → archived
```

- **`findLatest`** serve à checagem de dono e de status em edição, envio e arquivamento. A leitura e a escrita ficam em transações separadas; a corrida entre elas é fechada pelos índices únicos (uma versão aberta por anúncio) e pelo `SELECT … FOR UPDATE` dentro de `applyTransition`, que relê o status atual. `submit` e `archiveAll` revalidam o status dentro da transação e lançam `ListingVersionConflictError` se mudou, em vez de confiar na leitura anterior.
- **`createNextVersion` com `content` opcional**: a nova versão já nasce com as alterações, em uma única transação. Sem isso, a edição de uma versão publicada seria "copiar" e depois "atualizar", e uma falha no meio deixaria um rascunho idêntico ao publicado.
- **`updateDraft` não gera evento de auditoria:** editar o rascunho não é mudança de status (a trilha é de status; ver `listing-audit`). Atualiza `updated_at` e troca as imagens (delete + insert) na mesma transação, e falha com conflito se a versão deixou de ser `draft`.
- **`submit` no repositório, e não no caso de uso:** o `outbox.add(tx, …)` precisa da transação Drizzle, que só o adaptador possui. Expor a transação na porta vazaria o ORM para `application/`. O adaptador recebe `Outbox<Transaction>` e grava, na mesma transação do `transition`, a mensagem `{ topic: 'listing.submitted', payload: { listingId, version } }`. Mesmo critério da porta atual: operações de intenção.
- **`archiveAll`** reaproveita `applyTransition` por versão, com lock, e recusa se achar `in_review` ou nada a arquivar.

### 4. Edição: qual versão e que semântica

- A edição age sobre a **versão mais recente** do anúncio (`findLatest`); o cliente não informa versão. A API pública não expõe versões antigas para escrita.
- `PATCH /listings/:listingId`, parcial. Escolhido sobre `PUT` porque o caso de uso real é corrigir um campo, e a cópia de dados da versão anterior só faz sentido com merge.
- Por status da versão mais recente: `draft` → `updateDraft`; `published`/`rejected` → `createNextVersion(from, actor, mesclado)`; `in_review` e `archived` → conflito.
- Conflito do índice único (`ListingVersionConflictError`) vira 409.
- **Base da edição = versão mais recente, mesmo `rejected`.** Motivo (decisão do autor): a versão rejeitada está mais próxima da intenção do vendedor, que só precisa aplicar os ajustes apontados pela moderação. **Alternativa descartada:** partir sempre da última `published`, que evita herdar conteúdo reprovado, mas descarta o trabalho de correção já feito.
- **Trade-off aceito:** a versão em produção e a nova versão podem divergir. Uma função de **descartar versão** (voltar a partir da publicada) fica **fora de escopo e sem decisão**: o autor prefere aprender com o uso real antes de decidir. Documentar como evolução em `DECISIONS.md`.

### 5. Arquivamento do anúncio inteiro

`POST /listings/:listingId/archive` arquiva **todas** as versões não arquivadas. Alternativa descartada: arquivar só a versão mais recente, que deixaria uma versão `published` visível depois de o vendedor pedir para arquivar, ou exigiria o cliente conhecer versões. Recusar quando há `in_review` segue a SPEC ("qualquer exceto `in_review`") e evita corrida com o worker. Não há `unarchive`.

### 6. Autenticação: `@nestjs/jwt` com guard próprio

- `JwtService.verifyAsync` com `algorithms: ['HS256']` fixo (bloqueia `none` e troca de algoritmo) e `JWT_SECRET` do env (obrigatório, mínimo 32 caracteres, validado no zod do boot).
- `JwtAuthGuard` lê `Authorization: Bearer`, valida, exige `sub` string não vazia e anexa `request.sellerId`. Um decorator `@SellerId()` entrega o valor ao controller.
- **Descartado:** `@nestjs/passport` + `passport-jwt` (duas dependências e uma estratégia para o que o guard faz em ~20 linhas, que ainda explico linha a linha) e guard global com `@Public()` (as leituras públicas virão em outra change; guard por controller basta).
- **Script:** `pnpm auth:token <sellerId> [--expires-in 24h]`, em `src/cli/token.ts` no mesmo estilo de `src/cli/db.ts`, lendo `JWT_SECRET` do `.env`. Expiração padrão de 24 h.

### 7. HTTP

| Método e rota | Sucesso | Erros |
| --- | --- | --- |
| `POST /listings` | 201 `{ listingId, version, status }` | 400, 401 |
| `PATCH /listings/:listingId` | 200 idem (versão editada ou criada) | 400, 401, 404, 409 |
| `POST /listings/:listingId/submit` | 200 idem | 401, 404, 409 |
| `POST /listings/:listingId/archive` | 200 idem, da versão mais recente | 401, 404, 409 |

- `:listingId` que não é UUID → 404 (mesma resposta de inexistente), sem expor detalhe.
- **Outro vendedor → 404**, para não revelar a existência de anúncios alheios.
- Um filtro de exceções mapeia `InvalidTransitionError`, `ListingVersionConflictError` e `ListingNotFoundError` (nova, no domínio) para 409/409/404. Os demais erros continuam 500 sem vazar mensagem interna.
- Código em `modules/listings/http/` (controller, DTOs de Swagger, pipe, filtro) e `shared/auth/`. Controllers só validam, chamam o caso de uso e mapeiam a saída.

### 8. Casos de uso como classes pequenas

`CreateListing`, `EditListing`, `SubmitListing`, `ArchiveListing`, cada uma com `execute(...)`, injetando `LISTING_REPOSITORY`. Um arquivo por caso de uso: o controller fica fino e os testes de integração exercitam cada um contra o Postgres real sem HTTP. Sem camada de "service" agregadora.

## Risks / Trade-offs

- **Leitura e escrita em transações separadas** (`findLatest` e depois a operação) → índices únicos e a releitura de status com `FOR UPDATE` dentro da transação transformam a corrida em conflito 409; coberto por teste de edição concorrente.
- **404 para anúncio de outro vendedor** dificulta o diagnóstico para quem usa o token errado → aceito; é o padrão para não vazar existência.
- **Arquivar tudo de uma vez recusa `in_review`**: o vendedor precisa esperar a moderação (ou o reprocessamento) → decorre da SPEC; a moderação sempre termina em `published`/`rejected` ou fica `in_review` com falha registrada, caso em que o arquivamento fica bloqueado até o reprocessamento. Registrar como débito se incomodar.
- **`listing.submitted` sem consumidor até a `moderation-pipeline`**: as mensagens ficam pendentes no outbox, com o relay desligado na API → esperado; o teste só verifica a gravação.
- **`@nestjs/outbox` 0.1.4 é pré-1.0**: o registro do módulo (relay desabilitado na API, store com `migrate: false`) é confirmado na implementação com um teste de integração, não assumido aqui.
- **Segredo fraco ou vazado** permite forjar qualquer vendedor → mínimo de 32 caracteres e `.env` fora do git; sem rotação nesta versão.

## Open Questions

- Nenhuma que mude specs ou tasks. Limite da descrição: assumido **5000 caracteres**, constante em `LISTING_LIMITS` (a SPEC deixou "a definir no DTO").
