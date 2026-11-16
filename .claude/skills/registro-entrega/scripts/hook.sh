#!/usr/bin/env bash
# Hook UserPromptSubmit: injeta o horário atual e lembra de aplicar a skill registro-entrega.
printf '[registro-entrega] %s — Se esta mensagem trouxer pedido novo, decisão, divergência da proposta da IA, descarte, trade-off, ambiguidade, correção de algo gerado pela IA, validação ou marco, registre com a skill registro-entrega antes de encerrar a resposta. Sem motivo explícito do usuário, marque "a confirmar" e pergunte.\n' "$(date '+%Y-%m-%d %H:%M')"
