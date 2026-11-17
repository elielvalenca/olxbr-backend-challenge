# Spec Delta

## Purpose

Manter uma trilha append-only de cada mudança de status das versões de um anúncio, com quem a causou e o contexto necessário para diagnóstico, preparada para ser enriquecida com metadados no futuro.

## ADDED Requirements

### Requirement: Evento de auditoria por transição de status
Toda mudança de status de uma versão MUST gerar um evento de auditoria com: anúncio, versão, status de origem (ausente na criação), status de destino, ator, motivo opcional, metadados opcionais e instante da ocorrência.

#### Scenario: Criação de rascunho
- **WHEN** uma versão é criada em `draft`
- **THEN** existe um evento sem status de origem e com destino `draft`

#### Scenario: Reprovação com motivo
- **WHEN** uma versão em `in_review` passa a `rejected` com o motivo `price_out_of_range`
- **THEN** o evento registra origem `in_review`, destino `rejected` e o motivo informado

### Requirement: Evento gravado atomicamente com a transição
O evento de auditoria MUST ser persistido na mesma operação atômica da mudança de status: ou ambos são persistidos, ou nenhum.

#### Scenario: Falha na transição
- **WHEN** a mudança de status falha e é revertida
- **THEN** nenhum evento de auditoria correspondente permanece registrado

#### Scenario: Falha na gravação do evento
- **WHEN** a gravação do evento falha
- **THEN** a mudança de status também não é persistida

### Requirement: Ator identificado
O evento MUST registrar o ator como o identificador do vendedor autenticado ou como o sistema, quando a transição for automática, como na moderação ou no arquivamento da versão substituída.

#### Scenario: Envio para revisão pelo vendedor
- **WHEN** o vendedor envia o rascunho para revisão
- **THEN** o evento registra o identificador desse vendedor como ator

#### Scenario: Resultado da moderação
- **WHEN** a moderação publica ou reprova uma versão
- **THEN** o evento registra o sistema como ator

### Requirement: Trilha append-only
Eventos de auditoria SHALL NOT ser alterados nem removidos depois de gravados.

#### Scenario: Histórico preservado
- **WHEN** uma versão percorre vários status
- **THEN** o histórico mantém um evento por transição, em ordem cronológica

### Requirement: Evento vinculado a uma versão existente
Todo evento MUST referenciar uma versão existente do anúncio.

#### Scenario: Versão inexistente
- **WHEN** se tenta gravar um evento para um par (anúncio, versão) que não existe
- **THEN** a gravação é rejeitada pelo armazenamento

### Requirement: Metadados extensíveis
O evento SHALL aceitar metadados estruturados opcionais, sem exigir mudança de schema para novos campos.

#### Scenario: Evento sem metadados
- **WHEN** uma transição não tem metadados
- **THEN** o evento é gravado normalmente

#### Scenario: Evento com metadados
- **WHEN** a aplicação anexa metadados estruturados a uma transição
- **THEN** eles são recuperáveis junto do evento, sem alteração
