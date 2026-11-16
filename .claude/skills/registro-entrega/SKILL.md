---
name: registro-entrega
description: Mantém atualizados, durante o desafio, os entregáveis de documentação — DECISIONS.md, AI_USAGE.md e a linha do tempo AI_LOG.md (relatório de execução com horário). Use em TODA interação deste repositório em que houver um pedido novo, uma decisão técnica, uma divergência entre o que a IA propôs e o que o usuário decidiu, uma abordagem descartada, um trade-off analisado, um requisito ambíguo interpretado, algo gerado pela IA que foi rejeitado/corrigido, uma validação feita ou um marco (commit, etapa concluída) — mesmo que o usuário não peça para registrar.
---

# Registro de entregáveis

O desafio pede `DECISIONS.md` e `AI_USAGE.md` (ver README.md, seção "O que entregar"). O usuário também quer um relatório de execução leve, com horário, para reconstruir a timeline depois. Esta skill existe para que esses registros nasçam **durante** o trabalho, enquanto o motivo de cada escolha ainda está fresco — reconstruir isso no fim costuma gerar justificativas inventadas.

## Os três arquivos (raiz do repositório)

| Arquivo | Papel | Quem escreve |
| --- | --- | --- |
| `AI_LOG.md` | Timeline: uma linha por evento, com horário | sempre via `scripts/log.sh` |
| `DECISIONS.md` | Decisões, alternativas, ambiguidades, tempo, o que faria diferente | Edit, seguindo o template |
| `AI_USAGE.md` | Ferramentas, prompts úteis, o que foi rejeitado/corrigido, validação | Edit, seguindo o template |

Se algum não existir, rode `scripts/log.sh init` (cria a partir de `assets/`, sem sobrescrever).

## Como registrar

1. **Timeline** — sempre pelo script, porque ele usa o relógio do sistema:
   ```bash
   .claude/skills/registro-entrega/scripts/log.sh <tipo> "<texto curto>"
   .claude/skills/registro-entrega/scripts/log.sh -t 14:05 <tipo> "<texto>"   # evento passado
   ```
2. **Documento de destino** — se o tipo pede, edite também o DECISIONS.md / AI_USAGE.md na seção certa.
3. **Avise** em uma linha no fim da resposta o que foi registrado (ex.: `Registro: decisão D3 + timeline`), para o usuário corrigir na hora se discordar.

## Tipos e destino

| Tipo | Quando | Também vai para |
| --- | --- | --- |
| `pedido` | O usuário pediu algo novo / mudou o escopo | — |
| `proposta` | A IA propôs uma abordagem relevante | — (vira `decisao` ou `divergencia` quando o usuário responder) |
| `decisao` | Escolha técnica tomada | DECISIONS → Decisões técnicas |
| `divergencia` | O usuário decidiu diferente do que a IA propôs | DECISIONS (a decisão) **e** AI_USAGE → O que rejeitei ou corrigi |
| `descarte` | Uma abordagem foi abandonada | DECISIONS → alternativas da decisão relacionada |
| `trade-off` | Análise de prós/contras, com ou sem conclusão | DECISIONS (campo Trade-off da decisão) |
| `ambiguidade` | Requisito ambíguo e a interpretação escolhida | DECISIONS → Requisitos ambíguos |
| `correcao-ia` | Código/texto gerado pela IA rejeitado ou corrigido | AI_USAGE → O que rejeitei ou corrigi |
| `validacao` | Como algo foi verificado (teste, execução, leitura) | AI_USAGE → Como validei |
| `prompt` | Um prompt ou fluxo com a IA que funcionou bem | AI_USAGE → Prompts e fluxos |
| `marco` | Commit, etapa concluída, início/fim de sessão | — |

## Critérios de qualidade

- **Não invente o motivo.** Os documentos são a voz do candidato e serão discutidos na apresentação. Se o usuário decidiu/descartou algo sem dizer por quê, registre com `_motivo: a confirmar_` e pergunte em uma linha no fim da resposta. Um motivo inventado é pior que um motivo ausente.
- **Primeira pessoa do candidato** em DECISIONS.md e AI_USAGE.md ("Escolhi…", "A IA sugeriu X; rejeitei porque…"). Na timeline, frases curtas e neutras.
- **Proporção.** Registre o que muda o rumo ou que um avaliador perguntaria "por quê?". Não registre perguntas triviais, leituras de arquivo ou ajustes cosméticos. Uma interação pode não gerar nenhum registro — tudo bem.
- **Uma decisão, um lugar.** Antes de criar uma `### Dn` nova, veja se ela complementa uma existente (ex.: um descarte normalmente é alternativa de uma decisão já registrada). Numere sequencialmente: D1, D2…
- **Ligue os registros.** Na timeline, cite o id quando houver (`decisao "D2 — usar SQLite em memória"`), para cruzar com o DECISIONS.md.
- **Tempo gasto.** Ao final do desafio (ou quando pedido), estime o tempo pela timeline (`scripts/log.sh resumo` mostra primeiro/último horário de cada dia) e preencha a seção "Tempo gasto", deixando claro que é aproximado.

## Exemplo

Usuário: "Não, prefiro não usar ORM aqui, é muita coisa pra 3 tabelas. Vai de SQL puro."

```bash
.claude/skills/registro-entrega/scripts/log.sh divergencia "D2 — IA propôs ORM; usuário escolheu SQL puro (escopo pequeno)"
```

DECISIONS.md:
```markdown
### D2 — Acesso a dados com SQL puro
- **Contexto:** persistência de 3 tabelas simples.
- **Escolha:** SQL puro com o driver nativo.
- **Alternativas consideradas:** ORM (sugerido pela IA) — descartado: abstração desproporcional para 3 tabelas.
- **Trade-off:** mais SQL escrito à mão, em troca de menos dependências e de queries explícitas.
```

AI_USAGE.md → O que rejeitei ou corrigi:
```markdown
- **A IA propôs** um ORM para a camada de dados → **usei** SQL puro. **Por quê:** o escopo (3 tabelas) não justifica a abstração.
```
