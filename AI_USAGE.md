# Uso de IA

## Ferramentas e etapas

| Ferramenta | Etapas em que usei |
| --- | --- |
| Claude Code (Claude Opus) | Refinamento da spec, levantamento de ambiguidades, AGENTS.md, registro de decisões |

## Prompts e fluxos que funcionaram

- Pedir à IA para revisar a spec inicial contra o enunciado e o código do mock e listar ambiguidades **com uma recomendação para cada**; respondi item a item ("concordo" ou a minha escolha).

## O que rejeitei ou corrigi

- **A IA propôs** índice parcial no Postgres (ou tabela de projeção) para leitura → **fiz** projeção do detalhe no Redis, atualizada por job via outbox, com timeout e fallback para o banco. **Por quê:** o cache é facilmente gerenciado pelos gatilhos de mudança de status.

## Como validei

- Li o `server.js` do mock em vez de confiar só na doc: encontrei a divergência `reason` x `rejection_reason`, a taxa de erro de 20%, o rate limit e o header `x-mock-force`.
- Rodei um script sobre o seed: os 57 anúncios passam nas validações do enunciado, todos seriam aprovados pela moderação e nenhum tem imagem.
