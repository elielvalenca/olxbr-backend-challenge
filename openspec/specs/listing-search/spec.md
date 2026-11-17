# listing-search Specification

## Purpose
Permite a qualquer visitante listar os anúncios publicados, com paginação e filtro por categoria, sem expor anúncios em qualquer outro status.

## Requirements

### Requirement: Listagem pública só de anúncios publicados
A listagem SHALL ser pública (sem token) e MUST retornar apenas a versão `published` de cada anúncio. Versões em `draft`, `in_review`, `rejected` ou `archived` MUST NOT aparecer.

#### Scenario: Visitante sem token
- **WHEN** uma requisição sem `Authorization` lista anúncios
- **THEN** a resposta é bem-sucedida e traz só anúncios `published`

#### Scenario: Anúncio com nova versão em revisão
- **WHEN** o anúncio tem a versão 1 `published` e a versão 2 `in_review`
- **THEN** a listagem traz a versão 1, com os dados dela

#### Scenario: Anúncio sem versão publicada
- **WHEN** todas as versões do anúncio estão `draft`, `in_review`, `rejected` ou `archived`
- **THEN** o anúncio não aparece na listagem

#### Scenario: Token de outro vendedor ou do dono
- **WHEN** a listagem é pedida com um token válido
- **THEN** o resultado é o mesmo da requisição sem token

### Requirement: Item da listagem
Cada item SHALL conter `listingId`, `title`, `priceCents`, `category`, `publishedAt` e `coverImageUrl` (a imagem de menor posição da versão). Descrição e demais imagens MUST NOT constar da listagem.

#### Scenario: Capa
- **WHEN** a versão publicada tem 3 imagens
- **THEN** `coverImageUrl` é a imagem da primeira posição

#### Scenario: Campos do item
- **WHEN** a listagem retorna um anúncio
- **THEN** o item traz exatamente os campos acima, com preço em centavos

### Requirement: Ordenação
Os itens SHALL ser ordenados por `publishedAt` decrescente, com desempate determinístico, de modo que a mesma consulta sobre os mesmos dados retorne sempre a mesma ordem.

#### Scenario: Mais recente primeiro
- **WHEN** há dois anúncios publicados em instantes diferentes
- **THEN** o publicado depois vem antes

#### Scenario: Mesmo instante de publicação
- **WHEN** dois anúncios têm o mesmo `publishedAt`
- **THEN** a ordem entre eles é sempre a mesma entre páginas e requisições

### Requirement: Paginação offset/limit
A listagem SHALL aceitar `offset` (padrão 0) e `limit` (padrão configurável, máximo configurável) e MUST responder com `items` e metadados `total`, `offset` e `limit`. `total` é o número de anúncios que casam com o filtro, independente da página.

#### Scenario: Segunda página
- **WHEN** existem 25 anúncios publicados e se pede `offset=10&limit=10`
- **THEN** a resposta traz os itens 11 a 20 e `total` igual a 25

#### Scenario: Página além do fim
- **WHEN** `offset` é maior ou igual a `total`
- **THEN** `items` é vazio e `total` continua correto

#### Scenario: Valores padrão
- **WHEN** `offset` e `limit` são omitidos
- **THEN** são usados offset 0 e o limite padrão, e a resposta informa os valores usados

#### Scenario: Limite acima do máximo
- **WHEN** `limit` excede o máximo configurado
- **THEN** a resposta é requisição inválida, sem executar a consulta

#### Scenario: Parâmetros inválidos
- **WHEN** `offset` é negativo, `limit` é menor que 1 ou qualquer um deles não é inteiro
- **THEN** a resposta é requisição inválida

### Requirement: Filtro por categoria
A listagem SHALL aceitar `category` entre as categorias conhecidas e, quando informado, MUST retornar apenas anúncios dessa categoria, com `total` refletindo o filtro.

#### Scenario: Categoria informada
- **WHEN** se filtra por `moveis`
- **THEN** só anúncios de `moveis` são retornados e `total` conta apenas eles

#### Scenario: Categoria sem anúncios
- **WHEN** nenhum anúncio publicado pertence à categoria filtrada
- **THEN** `items` é vazio e `total` é 0

#### Scenario: Categoria desconhecida
- **WHEN** `category` não é uma categoria conhecida
- **THEN** a resposta é requisição inválida
