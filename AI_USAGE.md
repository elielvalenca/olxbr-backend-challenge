# Uso de IA

## Ferramentas e etapas

| Ferramenta | Etapas em que usei |
| --- | --- |
| Claude Code (Claude Opus) | **Planejamento:** refinamento da spec, levantamento de ambiguidades, `AGENTS.md` e as cinco changes do OpenSpec (proposal, specs, design, tasks). **Implementação:** código e testes de cada change (domínio, repositório Drizzle, pipeline de moderação, consultas, projeção, seed, Dockerfile e OTel). **Verificação:** leitura do mock, execução das suítes e smokes contra a stack do Compose. **Documentação:** README, `DECISIONS.md`, `AI_USAGE.md` e a timeline `AI_LOG.md`, pela skill `registro-entrega` |
| OpenSpec (CLI e comandos `/opsx:*`) | Conduzir cada change em `explore` → `propose` → `apply` → `archive`; as specs arquivadas em `openspec/specs/` documentam o comportamento |

## Prompts e fluxos que funcionaram

- Pedir à IA para revisar a spec inicial contra o enunciado e o código do mock e listar ambiguidades **com uma recomendação para cada**; respondi item a item ("concordo" ou a minha escolha).
- **Planejar antes de implementar, em changes pequenas.** A IA propôs quatro changes; separei a modelagem em uma change própria (D13) para revisar versionamento, constraints e migrations isoladamente, já que são caras de desfazer. Em cada change eu revisava proposal, specs e design antes do `apply`, e foi nessa revisão que saíram as divergências do D14 (sem `CHECK` do título) e do D18 (detalhe público e do dono separados).
- **`AGENTS.md` como contexto persistente.** Registrei ali os princípios (proporcionalidade, "preciso explicar cada linha"), a stack, as convenções e as divergências conhecidas do mock; inclui a regra de consultar a documentação do NestJS 12 e os pacotes oficiais antes de escrever infraestrutura própria (a correção do D10 e a troca do outbox próprio pelo `@nestjs/outbox` no D5 vieram dessa checagem).
- **Registro durante o trabalho, não no fim.** A skill `registro-entrega` e um hook `UserPromptSubmit` lembram a IA, a cada mensagem, de registrar decisões, divergências e correções na timeline (`scripts/log.sh`, com o relógio do sistema). A regra "não invente o motivo" faz a IA marcar `a confirmar` e perguntar; foi assim que as pendências apareceram e foram fechadas antes da entrega.
- **Pedir opções e escolher.** Quando havia mais de um desenho razoável (por exemplo, a rota do detalhe do dono, entre duas propostas), pedi as alternativas com prós e contras e decidi eu.
- **Questionar a viabilidade antes de aceitar.** Perguntei à IA se o fluxo editar (novo draft) → enviar → publicar era consistente com a SPEC antes de fechar a change de ciclo de vida; a resposta apontou que a edição parte da versão mais recente, o que virou o D16.

## O que rejeitei ou corrigi

- **A IA propôs** índice parcial no Postgres (ou tabela de projeção) para leitura → **fiz** projeção do detalhe no Redis, atualizada por job via outbox, com timeout e fallback para o banco. **Por quê:** o cache é facilmente gerenciado pelos gatilhos de mudança de status.

- **A IA afirmou** que Jest é o framework de testes padrão do NestJS, e eu aceitei → ao gerar o projeto, o NestJS 12 veio com Vitest, ESM puro e oxlint. **Por quê:** a IA estava desatualizada; a decisão foi revista a partir do scaffold e da documentação oficial.
- **A IA propôs** um `CHECK` de 10 a 100 caracteres no título, como segunda camada no banco → **recusei**. **Por quê:** quero poder ajustar o limite por configuração, sem migration.
- **A IA gerou** a migration do outbox com um comando que não existia (`pnpm exec outbox sql`; o binário se chama `nest-outbox`) e o redirecionamento de saída sobrescreveu o arquivo só com o cabeçalho → percebi ao ler o arquivo e conferir as tabelas no banco, e regenerei com o comando correto, só gravando se a saída não fosse vazia. **Por quê:** a documentação cita `npx @nestjs/outbox`, e eu havia assumido o nome do binário sem verificar.
- **A IA gerou** o `WorkerMetricsModule` registrando `ResilienceModule.forRoot()` pela segunda vez → os testes passaram, mas o worker em container caiu no boot ("registered 2 times") → percebi ao subir a stack completa e removi o registro duplicado, incluindo o módulo no teste de pipeline para pegar isso. **Por quê:** o módulo é global e só pode ser registrado uma vez; testes por módulo isolado não exercitavam o `WorkerModule` inteiro.
- **A IA gerou** a subconsulta da capa da listagem com colunas do Drizzle dentro de `sql`, que são emitidas sem o nome da tabela (`listing_id = listing_id`, sempre verdadeiro) → todos os anúncios mostravam a mesma capa. Os testes passaram porque tinham uma só imagem por anúncio; percebi ao rodar o seed com 57 anúncios e o e2e falhar → qualifiquei as colunas à mão e adicionei um teste com dois anúncios de capas diferentes, que falha no código antigo. **Por quê:** o teste original não distinguia a capa certa de qualquer capa.
- **A IA propôs** (seguindo a SPEC) detalhe único com autenticação opcional e `rejected` público com motivo → **separei** em detalhe público (só `published`, senão 404) e detalhe do dono (`/me/listings/:id`, qualquer status, com motivo). **Por quê:** deixar o endpoint público o mais restrito possível.
- **A IA assumiu** que o BullMQ 6 funcionaria só com `bullmq`/`@nestjs/bullmq` → o worker entrou em loop de erro até estourar a memória no teste de integração (`ioredis` é peer opcional e precisa ser instalado). **Por quê:** a IA não conferiu os peers da versão nova; corrigi instalando `ioredis` e achei o problema olhando o log do worker, não só o resultado do teste.
- **A IA configurou** `MODERATION_BREAKER_MIN_CALLS` sem olhar a janela do breaker (padrão de 20 chamadas) → valores acima de 20 derrubariam o boot. **Por quê:** o `@nestjs/resilience` valida a combinação; a janela agora acompanha o mínimo.

## Como validei

- Li o `server.js` do mock em vez de confiar só na doc: encontrei a divergência `reason` x `rejection_reason`, a taxa de erro de 20%, o rate limit e o header `x-mock-force`.
- Antes de cravar o design da modelagem, testei num diretório temporário o que a IA havia afirmado sobre as ferramentas: `drizzle-orm` aceita índice único parcial, PK/FK compostas e `generate --custom`, e `@nestjs/outbox sql` gera o schema `nest_outbox`. `openspec validate --strict` passou.
- Rodei um script sobre o seed: os 57 anúncios passam nas validações do enunciado, todos seriam aprovados pela moderação e nenhum tem imagem.
- Na implementação do modelo de dados, escrevi os testes de integração contra um Postgres real (Testcontainers) e fiz um teste de mutação: removendo os dois índices únicos parciais da migration, quatro testes de invariante passaram a falhar; restaurei o arquivo e a suíte voltou a passar. Também rodei o fluxo documentado do README a partir de uma cópia limpa (instalar, migrar, typecheck, lint e as três suítes) e conferi `db:reset` e a recusa em produção no banco do Compose.
- Na `moderation-pipeline`: teste de integração de ponta a ponta (Postgres + Redis em Testcontainers e um mock HTTP em memória) cobrindo aprovação, reprovação, `500` seguido de sucesso, `429` com `Retry-After`, `400`, tentativas esgotadas e reprocessamento; mais um smoke com API + worker contra o mock real do Compose (20% de `500`): 8 anúncios, 6 publicados e 2 reprovados com os motivos esperados, nenhuma falha definitiva.
- Gerei uma coleção do postman com o Newman e executei testes manuais no Postman para ter a segurança que estava funcionando contra testes automatizados também
