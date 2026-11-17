# Spec Delta

## Purpose

Permite à operação reenfileirar as moderações que falharam definitivamente, depois que a causa (ex.: indisponibilidade do serviço) for resolvida.

## ADDED Requirements

### Requirement: Failed moderation jobs can be reprocessed
O sistema SHALL oferecer um script que reenfileira todos os jobs de moderação falhos, com o contador de tentativas zerado, e informa quantos foram reenfileirados.

#### Scenario: Reprocessar após falha
- **WHEN** existem jobs falhos e o script é executado com o serviço de moderação saudável
- **THEN** os jobs são reenfileirados, processados e as versões deixam `in_review`

#### Scenario: Nada a reprocessar
- **WHEN** não há jobs falhos
- **THEN** o script informa zero jobs e termina com sucesso

### Requirement: Reprocessing is safe to repeat
O reprocessamento SHALL respeitar a idempotência da moderação: reenfileirar um job de versão que já não está `in_review` não altera o anúncio.

#### Scenario: Versão já resolvida
- **WHEN** um job falho é reenfileirado mas a versão já foi publicada por outro caminho
- **THEN** o job termina sem alterar a versão
