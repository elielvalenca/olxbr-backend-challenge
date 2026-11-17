# listing-detail-projection Specification

## Purpose
Serve o detalhe público de um anúncio publicado a partir de uma projeção pré-computada, mantida de forma assíncrona e eventualmente consistente, sem nunca tornar a leitura dependente dela: qualquer falha da projeção cai para o banco.

## Requirements

### Requirement: Publicação e arquivamento geram mensagem na mesma transação
Toda publicação de versão e todo arquivamento de anúncio SHALL registrar, na mesma transação da mudança de status, uma mensagem que identifica o anúncio afetado. Se a transação for desfeita, nenhuma mensagem MUST ser registrada. Reprovação e demais transições MUST NOT gerar mensagem de projeção.

#### Scenario: Publicação
- **WHEN** uma versão é publicada
- **THEN** existe uma mensagem `listing.published` para o anúncio, gravada junto com a mudança de status

#### Scenario: Publicação que substitui a anterior
- **WHEN** a versão 2 é publicada e a versão 1 é arquivada pelo sistema
- **THEN** há uma única mensagem de projeção para o anúncio

#### Scenario: Arquivamento do anúncio
- **WHEN** o dono arquiva o anúncio
- **THEN** existe uma mensagem `listing.archived` para o anúncio, gravada junto com as mudanças de status

#### Scenario: Transação desfeita
- **WHEN** a publicação falha por conflito e a transação é desfeita
- **THEN** nenhuma mensagem é registrada

#### Scenario: Reprovação
- **WHEN** uma versão é reprovada
- **THEN** nenhuma mensagem de projeção é registrada

### Requirement: Projeção reflete a versão publicada
Ao processar uma mensagem de projeção, o sistema SHALL reconstruir o payload do detalhe público a partir do estado atual do banco: se o anúncio tem versão `published`, o payload é gravado, substituindo o anterior; se não tem, a projeção do anúncio é removida.

#### Scenario: Primeira publicação
- **WHEN** a mensagem de um anúncio recém-publicado é processada
- **THEN** a projeção contém o mesmo detalhe que o banco devolveria para o público

#### Scenario: Nova versão publicada
- **WHEN** a versão 2 é publicada e a mensagem é processada
- **THEN** a projeção contém a versão 2

#### Scenario: Arquivamento
- **WHEN** o anúncio foi arquivado e a mensagem é processada
- **THEN** a projeção do anúncio deixa de existir

### Requirement: Processamento idempotente e independente da ordem
O resultado do processamento MUST depender só do estado atual do banco, não do conteúdo nem da ordem das mensagens. Processar a mesma mensagem mais de uma vez, ou mensagens fora de ordem, MUST levar à mesma projeção final.

#### Scenario: Mensagem repetida
- **WHEN** a mensagem de publicação é processada duas vezes
- **THEN** a projeção é a mesma após cada processamento

#### Scenario: Mensagem de publicação atrasada após arquivamento
- **WHEN** o anúncio foi arquivado e a mensagem antiga de publicação é processada depois
- **THEN** o anúncio continua sem projeção

### Requirement: Detalhe público lido da projeção
O detalhe público SHALL ser servido da projeção quando ela existir para o anúncio, com o mesmo conteúdo e formato da resposta lida do banco.

#### Scenario: Projeção existente
- **WHEN** o detalhe público é pedido e a projeção existe
- **THEN** a resposta é o payload projetado, idêntico ao que o banco devolveria

### Requirement: Fallback para o banco
Se a projeção não existir, não responder dentro do tempo limite configurado ou falhar, o detalhe público MUST ser lido do banco e a requisição MUST ter o mesmo resultado que teria com a projeção. Uma falha da projeção MUST NOT causar erro na resposta.

#### Scenario: Miss
- **WHEN** a projeção não existe e o anúncio está publicado
- **THEN** a resposta vem do banco

#### Scenario: Projeção indisponível
- **WHEN** a conexão com a projeção falha
- **THEN** a resposta vem do banco, sem erro

#### Scenario: Projeção lenta
- **WHEN** a projeção não responde dentro do tempo limite
- **THEN** a resposta vem do banco

#### Scenario: Anúncio não publicado
- **WHEN** o anúncio não tem versão publicada e a projeção não existe
- **THEN** a resposta é não encontrado

### Requirement: Tempo limite da leitura configurável
O tempo limite da leitura da projeção SHALL ser configurável por variável de ambiente, com valor inválido recusado na inicialização.

#### Scenario: Valor inválido
- **WHEN** o tempo limite configurado não é um inteiro positivo
- **THEN** a aplicação falha na inicialização com configuração inválida

### Requirement: Miss agenda reconstrução sem duplicar
Quando o detalhe é lido do banco por miss de um anúncio publicado, o sistema SHALL pedir a reconstrução da projeção sem atrasar a resposta, com no máximo um pedido pendente por anúncio. O sistema MUST NOT pedir reconstrução para anúncio sem versão publicada.

#### Scenario: Miss de anúncio publicado
- **WHEN** o detalhe de um anúncio publicado é lido do banco por miss
- **THEN** é pedida a reconstrução e, depois de processada, a projeção existe

#### Scenario: Muitos misses seguidos
- **WHEN** o mesmo anúncio sofre vários misses antes da reconstrução rodar
- **THEN** há um único pedido pendente para ele

#### Scenario: Identificador inexistente
- **WHEN** o detalhe de um identificador sem versão publicada é pedido
- **THEN** nenhuma reconstrução é pedida

#### Scenario: Fila indisponível
- **WHEN** o pedido de reconstrução falha
- **THEN** a resposta ao cliente não é afetada

### Requirement: Leitura nunca escreve a projeção
A leitura do detalhe MUST NOT criar, alterar ou remover a projeção; apenas o processamento das mensagens e das reconstruções o faz.

#### Scenario: Leitura com miss
- **WHEN** o detalhe é lido por miss
- **THEN** a projeção continua inexistente até a reconstrução ser processada

### Requirement: Projeção expira
A projeção SHALL ter validade configurável, para limitar a memória e corrigir sozinha divergências (por exemplo, uma mensagem perdida). Depois de expirada, vale o comportamento de miss.

#### Scenario: Expiração
- **WHEN** a validade da projeção termina
- **THEN** o detalhe volta a ser lido do banco e uma reconstrução é pedida

### Requirement: Detalhe do dono não usa a projeção
O detalhe do dono MUST ser lido sempre do banco, e versões que não são a publicada MUST NOT constar da projeção.

#### Scenario: Rascunho do dono
- **WHEN** o dono pede o detalhe de uma versão `draft` ou `in_review`
- **THEN** a resposta vem do banco e nada é projetado
