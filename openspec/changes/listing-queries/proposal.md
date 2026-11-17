# Proposal

## Why

O enunciado pede listar anúncios com paginação e filtro por categoria e exibir o detalhe com status. A leitura pública precisa respeitar a visibilidade por status e mostrar o motivo da reprovação.

## What Changes

- Listagem pública: apenas `published`, paginação `offset`/`limit` (limite máximo configurado), filtro por `category`, ordenação por `published_at desc`, metadados de paginação.
- Detalhe lido do Postgres: público para `published` e `rejected` (com motivo); `draft` e `in_review` só para o dono autenticado; demais casos respondem 404.
- Imagens incluídas no detalhe e na listagem (capa).
- Contrato no Swagger.
- Fora de escopo: cache/projeção do detalhe (`detail-projection`) e cursor.

## Capabilities

### New Capabilities
- `listing-search`: listagem pública paginada com filtro por categoria.
- `listing-detail`: detalhe do anúncio com status, motivo da reprovação e regras de visibilidade.

### Modified Capabilities

## Impact

- Código: `src/modules/listings/{application,http,infrastructure}` (queries e controllers de leitura).
- Depende de: `listing-data-model` (índices) e `listing-lifecycle` (autenticação opcional do dono).
