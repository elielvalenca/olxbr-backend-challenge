# listing-moderation Specification

## Purpose
Define como um anúncio enviado para revisão é moderado de forma assíncrona e como o resultado de negócio (`published` ou `rejected`, com motivo) é aplicado à versão.

## Requirements

### Requirement: Submission triggers moderation
Ao enviar uma versão para revisão, o sistema SHALL garantir que exista uma moderação pendente para ela, sem depender de a API estar no ar no momento da moderação.

#### Scenario: Versão enviada é moderada
- **WHEN** uma versão `draft` é enviada para revisão e o serviço de moderação aprova o anúncio
- **THEN** a versão passa a `published` com `published_at` preenchido

#### Scenario: Mensagem republicada não duplica a moderação
- **WHEN** a mesma mensagem de envio é publicada na fila mais de uma vez enquanto o job existe
- **THEN** apenas um job de moderação existe para ela

### Requirement: Approved listing is published
Quando a moderação aprova, o sistema SHALL mover a versão de `in_review` para `published` e arquivar, na mesma transação, a versão publicada anterior do mesmo anúncio, se houver.

#### Scenario: Aprovação de primeira versão
- **WHEN** a moderação aprova a versão 1 de um anúncio
- **THEN** a versão 1 fica `published` e um evento de auditoria registra `in_review` → `published` pelo sistema

#### Scenario: Aprovação de nova versão
- **WHEN** a moderação aprova a versão 2 e a versão 1 está `published`
- **THEN** a versão 2 fica `published`, a versão 1 fica `archived` e existe no máximo uma versão publicada

### Requirement: Rejected listing carries the reason
Quando a moderação reprova, o sistema SHALL mover a versão para `rejected` guardando o motivo informado pelo serviço, e SHALL aceitar o motivo tanto em `rejection_reason` quanto em `reason`.

#### Scenario: Reprovação com `rejection_reason`
- **WHEN** o serviço responde reprovação com `rejection_reason: "price_out_of_range"`
- **THEN** a versão fica `rejected` com `rejection_reason` igual a `price_out_of_range` e o evento de auditoria carrega o motivo

#### Scenario: Reprovação com `reason`
- **WHEN** o serviço responde reprovação com o motivo no campo `reason`
- **THEN** a versão fica `rejected` com esse motivo

### Requirement: Moderation is idempotent per version
O sistema SHALL ignorar o resultado da moderação quando a versão não estiver mais `in_review`, sem alterar o anúncio nem registrar nova transição.

#### Scenario: Job processado duas vezes
- **WHEN** o job de uma versão já `published` ou `rejected` é processado de novo
- **THEN** o estado e a auditoria da versão permanecem inalterados

#### Scenario: Resultado concorrente
- **WHEN** dois processamentos da mesma versão terminam quase ao mesmo tempo
- **THEN** somente um aplica o resultado e o outro é descartado sem erro

### Requirement: Moderation request carries the listing content
O sistema SHALL enviar ao serviço de moderação título, descrição, categoria e preço em reais (o preço armazenado em centavos dividido por 100).

#### Scenario: Preço convertido
- **WHEN** uma versão com `price_cents` igual a 150000 é moderada
- **THEN** a requisição ao serviço leva `price` igual a 1500
