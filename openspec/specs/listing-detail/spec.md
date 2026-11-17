# listing-detail Specification

## Purpose
Expõe o detalhe de um anúncio em duas visões separadas: a pública, restrita à versão publicada, e a do dono, autenticada, com a versão mais recente em qualquer status e o motivo da reprovação.

## Requirements

### Requirement: Detalhe público só de versão publicada
`GET /listings/:listingId` SHALL ser público (sem token) e retornar a versão `published` do anúncio. Se o anúncio não tem versão `published`, a resposta MUST ser não encontrado, qualquer que seja o status das demais versões. A existência de versões mais novas em `draft`, `in_review` ou `rejected` MUST NOT alterar a resposta.

#### Scenario: Visitante vê o publicado
- **WHEN** um visitante sem token pede o detalhe de um anúncio com versão `published`
- **THEN** recebe os dados completos dessa versão com `status` `published`

#### Scenario: Nova versão em revisão não aparece
- **WHEN** o anúncio tem a versão 1 `published` e a versão 2 `in_review`
- **THEN** o detalhe público retorna a versão 1

#### Scenario: Nova versão reprovada não aparece
- **WHEN** a versão 1 está `published` e a versão 2 `rejected`
- **THEN** o detalhe público retorna a versão 1, sem motivo de reprovação

### Requirement: Anúncio sem versão publicada responde 404 no detalhe público
Um anúncio cujas versões estão todas em `draft`, `in_review`, `rejected` ou `archived`, um identificador inexistente ou que não seja UUID MUST responder não encontrado, sem distinguir os casos.

#### Scenario: Rascunho
- **WHEN** um visitante pede o detalhe de um anúncio só com versão `draft`
- **THEN** a resposta é não encontrado

#### Scenario: Em revisão
- **WHEN** a única versão está `in_review`
- **THEN** a resposta é não encontrado

#### Scenario: Reprovado
- **WHEN** a única versão está `rejected`
- **THEN** a resposta é não encontrado, sem revelar o motivo

#### Scenario: Arquivado
- **WHEN** todas as versões estão `archived`
- **THEN** a resposta é não encontrado

#### Scenario: Inexistente ou identificador inválido
- **WHEN** o identificador não existe ou não é um UUID
- **THEN** a resposta é não encontrado

### Requirement: Detalhe público ignora credenciais
O detalhe público MUST responder igual com ou sem `Authorization`, inclusive com token inválido, e MUST NOT dar tratamento diferente ao dono.

#### Scenario: Dono no endpoint público
- **WHEN** o dono pede o detalhe público de um anúncio cuja única versão é `draft`
- **THEN** a resposta é não encontrado

#### Scenario: Token inválido no endpoint público
- **WHEN** o detalhe público de um anúncio publicado é pedido com um token expirado
- **THEN** a resposta é bem-sucedida

### Requirement: Detalhe do dono exige autenticação
`GET /me/listings/:listingId` SHALL exigir token JWT válido, com as mesmas regras de autenticação dos endpoints de escrita. Sem token ou com token inválido a resposta MUST ser não autorizado.

#### Scenario: Sem token
- **WHEN** o detalhe do dono é pedido sem `Authorization`
- **THEN** a resposta é não autorizado

#### Scenario: Token inválido
- **WHEN** o token está expirado ou tem assinatura inválida
- **THEN** a resposta é não autorizado

### Requirement: Dono vê a versão mais recente em qualquer status
Para o vendedor do anúncio, o detalhe do dono SHALL retornar a versão mais recente em qualquer status (`draft`, `in_review`, `published`, `rejected`, `archived`).

#### Scenario: Dono vê rascunho
- **WHEN** o dono pede o detalhe e a versão mais recente é `draft`
- **THEN** recebe essa versão com `status` `draft`

#### Scenario: Dono vê versão em revisão
- **WHEN** a versão 1 está `published`, a versão 2 `in_review` e o dono pede o detalhe
- **THEN** recebe a versão 2

#### Scenario: Dono vê reprovação com motivo
- **WHEN** a versão mais recente foi reprovada com motivo `price_out_of_range`
- **THEN** recebe a versão com `status` `rejected` e `rejectionReason` igual a `price_out_of_range`

### Requirement: Anúncio de outro vendedor responde 404 ao dono
Se o anúncio não existe, pertence a outro vendedor ou o identificador não é UUID, o detalhe do dono MUST responder não encontrado, sem distinguir os casos.

#### Scenario: Outro vendedor
- **WHEN** um vendedor autenticado pede o detalhe do dono de um anúncio de outro vendedor
- **THEN** a resposta é não encontrado

#### Scenario: Inexistente
- **WHEN** o identificador não existe ou não é UUID
- **THEN** a resposta é não encontrado

### Requirement: Conteúdo do detalhe
As duas visões SHALL retornar `listingId`, `version`, `status`, `title`, `description`, `priceCents`, `category`, `imageUrls` (em ordem de posição) e `publishedAt`. `rejectionReason` MUST constar apenas no detalhe do dono e apenas quando o status é `rejected`. `sellerId` MUST NOT constar de nenhuma das duas.

#### Scenario: Imagens em ordem
- **WHEN** a versão tem 3 imagens
- **THEN** `imageUrls` traz as 3, na ordem das posições

#### Scenario: Detalhe público sem motivo
- **WHEN** o detalhe público retorna uma versão
- **THEN** a resposta não tem o campo `rejectionReason`

#### Scenario: Vendedor não exposto
- **WHEN** qualquer detalhe é retornado
- **THEN** a resposta não contém o identificador do vendedor
