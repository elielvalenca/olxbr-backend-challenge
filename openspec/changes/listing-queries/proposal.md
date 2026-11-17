# Proposal

## Why

O enunciado pede listar anúncios com paginação e filtro por categoria e exibir o detalhe com status. A leitura pública precisa respeitar a visibilidade por status, e o dono precisa acompanhar o status e o motivo da reprovação dos seus anúncios.

## What Changes

- Listagem pública: apenas `published`, paginação `offset`/`limit` (limite máximo configurado), filtro por `category`, ordenação por `published_at desc`, metadados de paginação.
- Detalhe público (`GET /listings/:listingId`), lido do Postgres: só a versão `published`; sem versão publicada responde 404.
- Detalhe do dono (`GET /me/listings/:listingId`), autenticado: versão mais recente em qualquer status, com `rejectionReason` quando reprovada; anúncio de outro vendedor responde 404.
- Imagens incluídas no detalhe e na listagem (capa).
- Contrato no Swagger.
- Fora de escopo: cache/projeção do detalhe (`detail-projection`) e cursor.

## Capabilities

### New Capabilities
- `listing-search`: listagem pública paginada com filtro por categoria.
- `listing-detail`: detalhe público (só publicado) e detalhe do dono (qualquer status, com motivo da reprovação).

### Modified Capabilities

## Impact

- Código: `src/modules/listings/{application,http,infrastructure}` (queries e controllers de leitura).
- Depende de: `listing-data-model` (índices) e `listing-lifecycle` (autenticação opcional do dono).
