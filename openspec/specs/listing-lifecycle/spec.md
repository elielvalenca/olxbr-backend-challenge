# listing-lifecycle Specification

## Purpose
Define os status do anúncio, as transições permitidas e quem as executa, incluindo o envio para revisão e o arquivamento.

## Requirements

### Requirement: Status e transições válidas
Uma versão MUST ter um dos status `draft`, `in_review`, `rejected`, `published` ou `archived`, e SHALL só mudar de status pelas transições da tabela abaixo. Qualquer outra transição MUST ser recusada, sem alterar a versão nem gravar evento de auditoria.

| De | Para | Quem |
| --- | --- | --- |
| `draft` | `in_review` | vendedor |
| `in_review` | `published` ou `rejected` | moderação |
| `published` | `archived` | sistema (nova versão publicada) ou vendedor |
| `draft`, `rejected` | `archived` | vendedor |

#### Scenario: Transição válida
- **WHEN** uma versão em `draft` é enviada para revisão
- **THEN** a versão passa a `in_review`

#### Scenario: Transição inválida
- **WHEN** se tenta mover uma versão `published` para `in_review`
- **THEN** a operação é recusada e a versão continua `published`

#### Scenario: Status final
- **WHEN** se tenta mover uma versão `archived` para qualquer outro status
- **THEN** a operação é recusada

### Requirement: Envio para revisão
O vendedor dono SHALL poder enviar para revisão a versão em `draft` de um anúncio. A mudança de status, o evento de auditoria e a mensagem de moderação pendente MUST ser gravados atomicamente.

#### Scenario: Envio de rascunho
- **WHEN** o dono envia o rascunho para revisão
- **THEN** a versão passa a `in_review`, existe um evento de auditoria com o vendedor como ator e existe uma mensagem pendente identificando o anúncio e a versão

#### Scenario: Envio sem rascunho
- **WHEN** a versão mais recente do anúncio não está em `draft`
- **THEN** o envio é recusado com conflito e nenhuma mensagem é gravada

#### Scenario: Falha na gravação da mensagem
- **WHEN** a gravação da mensagem de moderação falha
- **THEN** a versão continua `draft` e nenhum evento de auditoria do envio é gravado

### Requirement: Edição cria nova versão quando necessário
A edição de uma versão `published` ou `rejected` MUST criar uma nova versão `draft` com os dados da versão editada e as alterações aplicadas, sem modificar a versão original. A edição de uma versão `draft` MUST alterá-la no lugar, sem criar versão.

#### Scenario: Editar versão publicada
- **WHEN** o dono edita o título de um anúncio cuja versão mais recente é a 1, `published`
- **THEN** existe a versão 2 em `draft` com o novo título e a versão 1 continua `published`, inalterada

#### Scenario: Editar versão rejeitada
- **WHEN** o dono edita um anúncio cuja versão mais recente está `rejected`
- **THEN** existe uma nova versão `draft` com as alterações e a versão rejeitada continua com o seu motivo

#### Scenario: Editar rascunho
- **WHEN** o dono edita um anúncio cuja versão mais recente é `draft`
- **THEN** a mesma versão é alterada e nenhuma versão nova é criada

#### Scenario: Editar versão em revisão
- **WHEN** o dono tenta editar um anúncio cuja versão mais recente está `in_review`
- **THEN** a edição é recusada com conflito

#### Scenario: Editar anúncio arquivado
- **WHEN** o dono tenta editar um anúncio cuja versão mais recente está `archived`
- **THEN** a edição é recusada com conflito

#### Scenario: Edição concorrente
- **WHEN** duas edições concorrentes tentam criar a próxima versão do mesmo anúncio
- **THEN** no máximo uma conclui e a outra é recusada com conflito

### Requirement: Arquivamento pelo vendedor
O vendedor dono SHALL poder arquivar um anúncio, movendo para `archived` todas as suas versões que ainda não estejam arquivadas, atomicamente, com um evento de auditoria por versão. O arquivamento MUST ser recusado, sem alterar nada, se alguma versão estiver `in_review`.

#### Scenario: Arquivar anúncio publicado com rascunho aberto
- **WHEN** o dono arquiva um anúncio com a versão 1 `published` e a versão 2 `draft`
- **THEN** as duas versões passam a `archived`, cada uma com um evento de auditoria

#### Scenario: Arquivar com versão em revisão
- **WHEN** o dono arquiva um anúncio que tem uma versão `in_review`
- **THEN** o arquivamento é recusado com conflito e nenhuma versão muda

#### Scenario: Arquivar anúncio já arquivado
- **WHEN** o dono arquiva um anúncio cujas versões já estão todas `archived`
- **THEN** o arquivamento é recusado com conflito

### Requirement: Auditoria de toda transição
Toda transição realizada por este ciclo de vida MUST gerar um evento de auditoria, conforme a capacidade `listing-audit`, com o identificador do vendedor como ator.

#### Scenario: Histórico de um anúncio
- **WHEN** o dono cria, envia para revisão e arquiva um anúncio
- **THEN** o histórico contém um evento por transição, em ordem cronológica
