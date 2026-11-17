# Proposal

## Why

O fluxo central do desafio: criar um anúncio com validações, editá-lo como rascunho, enviá-lo para revisão e arquivá-lo. Esta change entrega as regras de negócio e a API de escrita sobre o modelo definido em `listing-data-model`, sem depender da moderação.

## What Changes

- Domínio: status (`draft`, `in_review`, `rejected`, `published`, `archived`), tabela de transições válidas e regras de versionamento (editar `published`/`rejected` cria nova versão `draft`).
- Validações estáticas no rascunho: título 10–100 (com trim), preço > 0 em centavos, categoria entre as 6 do mock, descrição obrigatória, 1–10 imagens `https`. Sem validar faixa de preço por categoria.
- Endpoints autenticados: criar, editar, enviar para revisão, arquivar. Envio para revisão grava a mensagem de outbox (o consumo vem na `moderation-pipeline`).
- Autenticação JWT HS256 (`sub` = `seller_id`), guard e script para emitir token.
- Registro de auditoria em toda transição.
- Contrato documentado no Swagger.
- Fora de escopo: moderação em si, listagem pública e detalhe público.

## Capabilities

### New Capabilities
- `listing-lifecycle`: status, transições, versionamento na edição e arquivamento.
- `listing-authoring`: criação e edição de rascunho com as validações estáticas.
- `seller-authentication`: JWT para endpoints de escrita e identificação do dono.

### Modified Capabilities

## Impact

- Código: `src/modules/listings/{domain,application,http}`, `src/shared/auth/`, script de emissão de JWT.
- Dependências: `@nestjs/jwt`, `@nestjs/outbox` (só `outbox.add` no envio).
- Depende de: `listing-data-model`.
