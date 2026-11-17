# Proposal

## Why

Tudo no serviço depende do modelo de dados: versionamento append-only, auditoria, preço em centavos, projeção de leitura e outbox. Errar aqui custa caro porque migrations em tabela com histórico são difíceis de desfazer. Isolar a modelagem numa change própria permite decidir com calma e validar o desenho (inclusive contra consultas reais) antes de construir regras em cima dele.

## What Changes

- Schema Drizzle e primeira migration versionada: `listings`, `listing_images`, `listing_audit_events`.
- Modelo de versões append-only: `listing_id` estável + `version`; como representar "versão vigente publicada" sem ambiguidade; unicidade e constraints que impeçam estados inválidos (por exemplo, duas versões publicadas do mesmo anúncio).
- Preço em centavos (`bigint`), status como enum, `rejection_reason`, timestamps de transição (`submitted_at`, `published_at`, …).
- Índices para os acessos previstos: listagem de publicados por categoria, detalhe por `listing_id`, versões de um dono.
- Auditoria mínima: evento por transição, sem dados de usuário além do `seller_id` (`sub` do JWT).
- Convivência com o schema `nest_outbox` do `@nestjs/outbox` (migrations do pacote separadas das nossas).
- Infra de acesso a dados: módulo Drizzle, transação, scripts de migrate e reset.
- Fora de escopo: regras de transição, endpoints, fila e projeção (changes seguintes).

## Capabilities

### New Capabilities
- `listing-versioning`: identidade estável do anúncio, versões append-only e invariantes de unicidade da versão vigente.
- `listing-audit`: trilha de auditoria de transições de status.

### Modified Capabilities

## Impact

- Código: `src/shared/database/`, `src/modules/listings/infrastructure/` (schema e repositório base), `drizzle/` (migrations).
- Dependências: `drizzle-orm`, `drizzle-kit`, `pg`, `@nestjs/drizzle`.
- Decisões a registrar: modelagem das versões, tipos e constraints, estratégia de migrations com o outbox.
