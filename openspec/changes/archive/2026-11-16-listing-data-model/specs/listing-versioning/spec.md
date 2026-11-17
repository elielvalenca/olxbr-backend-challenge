# Spec Delta

## Purpose

Define como um anúncio é armazenado em versões append-only e quais invariantes o armazenamento garante por si só, de modo que a aplicação não precise controlar corridas entre escritas concorrentes.

## ADDED Requirements

### Requirement: Versão identificada por anúncio e número
Cada versão de um anúncio MUST ser identificada pelo par (identificador do anúncio, número da versão). O número da versão MUST ser único dentro do mesmo anúncio. O identificador do anúncio é compartilhado por todas as suas versões.

#### Scenario: Versões distintas do mesmo anúncio
- **WHEN** são gravadas as versões 1 e 2 do mesmo anúncio
- **THEN** ambas existem e são recuperáveis pelo par (anúncio, versão)

#### Scenario: Número de versão repetido
- **WHEN** se tenta gravar uma segunda versão com o mesmo número para o mesmo anúncio
- **THEN** a gravação é rejeitada pelo armazenamento

### Requirement: No máximo uma versão publicada por anúncio
O armazenamento SHALL garantir que um anúncio tenha no máximo uma versão com status `published` em qualquer instante, mesmo sob escritas concorrentes.

#### Scenario: Segunda versão publicada sem arquivar a anterior
- **WHEN** uma versão passa para `published` enquanto outra versão do mesmo anúncio ainda está `published`
- **THEN** a operação é rejeitada pelo armazenamento e nenhuma das duas versões é alterada

#### Scenario: Publicações concorrentes
- **WHEN** duas versões do mesmo anúncio tentam ser publicadas ao mesmo tempo
- **THEN** no máximo uma conclui e a outra falha por violação de unicidade

#### Scenario: Anúncios diferentes não competem
- **WHEN** dois anúncios distintos têm uma versão `published` cada
- **THEN** ambas são aceitas

### Requirement: Substituição atômica da versão publicada
A publicação de uma nova versão MUST arquivar a versão publicada anterior e publicar a nova na mesma operação atômica, nesta ordem.

#### Scenario: Nova versão substitui a publicada
- **WHEN** a versão 2 é publicada e a versão 1 do mesmo anúncio está `published`
- **THEN** a versão 1 passa a `archived` e a versão 2 a `published`, ou nenhuma das duas mudanças é persistida

### Requirement: No máximo uma versão aberta por anúncio
O armazenamento SHALL garantir que um anúncio tenha no máximo uma versão com status `draft` ou `in_review` em qualquer instante.

#### Scenario: Segundo rascunho do mesmo anúncio
- **WHEN** se tenta criar uma nova versão `draft` enquanto outra versão do mesmo anúncio está `draft` ou `in_review`
- **THEN** a criação é rejeitada pelo armazenamento

#### Scenario: Nova versão depois de uma rejeição
- **WHEN** a única versão aberta do anúncio passou a `rejected` ou `published`
- **THEN** uma nova versão `draft` pode ser criada

#### Scenario: Edição concorrente
- **WHEN** duas edições concorrentes tentam criar a próxima versão do mesmo anúncio
- **THEN** no máximo uma conclui

### Requirement: Status restrito ao conjunto conhecido
O status de uma versão MUST ser um dentre `draft`, `in_review`, `rejected`, `published` e `archived`. O motivo de reprovação SHALL ser texto livre, sem restrição a uma lista de valores.

#### Scenario: Status desconhecido
- **WHEN** se tenta gravar uma versão com um status fora do conjunto
- **THEN** a gravação é rejeitada pelo armazenamento

#### Scenario: Motivo de reprovação novo
- **WHEN** uma versão é reprovada com um motivo ainda não conhecido pela aplicação
- **THEN** o motivo é armazenado como recebido

### Requirement: Preço em centavos, positivo
O preço MUST ser armazenado como inteiro em centavos e MUST ser maior que zero.

#### Scenario: Preço zero ou negativo
- **WHEN** se tenta gravar uma versão com preço menor ou igual a zero
- **THEN** a gravação é rejeitada pelo armazenamento

#### Scenario: Valor sem arredondamento
- **WHEN** um preço de R$ 1.234,56 é gravado como 123456 centavos
- **THEN** o mesmo valor é lido de volta, sem perda de precisão

### Requirement: Limite de tamanho do título fora do armazenamento
O armazenamento MUST NOT impor o intervalo de tamanho do título, que é regra da aplicação ajustável por configuração sem alteração de schema.

#### Scenario: Título fora do intervalo de negócio
- **WHEN** a aplicação grava um título com qualquer tamanho
- **THEN** o armazenamento o aceita, e a validação de tamanho cabe à camada de aplicação

### Requirement: Imagens ordenadas e pertencentes a uma versão
Cada imagem MUST pertencer a exatamente uma versão e ter uma posição única e não negativa dentro dela. O armazenamento MUST NOT impor um número máximo de imagens, que é regra da aplicação ajustável por configuração.

#### Scenario: Posição repetida
- **WHEN** se tenta gravar duas imagens na mesma posição da mesma versão
- **THEN** a gravação é rejeitada pelo armazenamento

#### Scenario: Imagem sem versão
- **WHEN** se tenta gravar uma imagem para uma versão que não existe
- **THEN** a gravação é rejeitada pelo armazenamento

#### Scenario: Imagens em ordem
- **WHEN** as imagens de uma versão são lidas
- **THEN** elas são retornadas na ordem de suas posições

### Requirement: Nova versão copia as imagens e as versões ficam imutáveis entre si
Ao criar uma nova versão a partir de outra, as imagens da versão de origem MUST ser copiadas para a nova. Alterar as imagens de uma versão MUST NOT alterar as de nenhuma outra versão do mesmo anúncio.

#### Scenario: Edição do rascunho não afeta a versão publicada
- **WHEN** a versão 2, criada a partir da versão 1 publicada, tem suas imagens alteradas
- **THEN** as imagens da versão 1 permanecem idênticas

#### Scenario: Cópia na criação
- **WHEN** a versão 2 é criada a partir da versão 1 que tem 3 imagens
- **THEN** a versão 2 nasce com as mesmas 3 imagens, nas mesmas posições
