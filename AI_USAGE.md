# Uso de IA

## Ferramentas e etapas

| Ferramenta | Etapas em que usei |
| --- | --- |
| Claude Code (Claude Opus) | Refinamento da spec, levantamento de ambiguidades, AGENTS.md, registro de decisões |

## Prompts e fluxos que funcionaram

- Pedir à IA para revisar a spec inicial contra o enunciado e o código do mock e listar ambiguidades **com uma recomendação para cada**; respondi item a item ("concordo" ou a minha escolha).

## O que rejeitei ou corrigi

- **A IA propôs** índice parcial no Postgres (ou tabela de projeção) para leitura → **fiz** projeção do detalhe no Redis, atualizada por job via outbox, com timeout e fallback para o banco. **Por quê:** o cache é facilmente gerenciado pelos gatilhos de mudança de status.

- **A IA afirmou** que Jest é o framework de testes padrão do NestJS, e eu aceitei → ao gerar o projeto, o NestJS 12 veio com Vitest, ESM puro e oxlint. **Por quê:** a IA estava desatualizada; a decisão foi revista a partir do scaffold e da documentação oficial.
- **A IA propôs** um `CHECK` de 10 a 100 caracteres no título, como segunda camada no banco → **recusei**. **Por quê:** quero poder ajustar o limite por configuração, sem migration.
- **A IA gerou** a migration do outbox com um comando que não existia (`pnpm exec outbox sql`; o binário se chama `nest-outbox`) e o redirecionamento de saída sobrescreveu o arquivo só com o cabeçalho → percebi ao ler o arquivo e conferir as tabelas no banco, e regenerei com o comando correto, só gravando se a saída não fosse vazia. **Por quê:** a documentação cita `npx @nestjs/outbox`, e eu havia assumido o nome do binário sem verificar.

## Como validei

- Li o `server.js` do mock em vez de confiar só na doc: encontrei a divergência `reason` x `rejection_reason`, a taxa de erro de 20%, o rate limit e o header `x-mock-force`.
- Antes de cravar o design da modelagem, testei num diretório temporário o que a IA havia afirmado sobre as ferramentas: `drizzle-orm` aceita índice único parcial, PK/FK compostas e `generate --custom`, e `@nestjs/outbox sql` gera o schema `nest_outbox`. `openspec validate --strict` passou.
- Rodei um script sobre o seed: os 57 anúncios passam nas validações do enunciado, todos seriam aprovados pela moderação e nenhum tem imagem.
- Na implementação do modelo de dados, escrevi os testes de integração contra um Postgres real (Testcontainers) e fiz um teste de mutação: removendo os dois índices únicos parciais da migration, quatro testes de invariante passaram a falhar; restaurei o arquivo e a suíte voltou a passar. Também rodei o fluxo documentado do README a partir de uma cópia limpa (instalar, migrar, typecheck, lint e as três suítes) e conferi `db:reset` e a recusa em produção no banco do Compose.
