## ADDED Requirements

### Requirement: Criação de anúncio em rascunho
O vendedor autenticado SHALL poder criar um anúncio informando título, descrição, preço em centavos, categoria e imagens. O anúncio MUST nascer na versão 1, em `draft`, pertencente ao vendedor, e a resposta MUST informar o identificador do anúncio, a versão e o status.

#### Scenario: Criação válida
- **WHEN** o vendedor envia dados válidos
- **THEN** o anúncio é criado como versão 1 em `draft`, com as imagens na ordem informada, e a resposta traz o identificador, a versão e o status

#### Scenario: Dono registrado
- **WHEN** o vendedor cria um anúncio
- **THEN** o anúncio fica associado ao identificador do vendedor presente no token, e não a um valor do corpo da requisição

### Requirement: Validações do conteúdo
O conteúdo MUST respeitar, na criação e na edição, as regras abaixo, e uma violação MUST ser recusada como requisição inválida, listando os campos incorretos.

- Título: após remover espaços nas pontas, de 10 a 100 caracteres.
- Descrição: obrigatória, após remover espaços nas pontas.
- Preço: inteiro, em centavos, maior que zero.
- Categoria: uma entre `eletronicos`, `moveis`, `veiculos`, `imoveis`, `esportes` e `colecionaveis`.
- Imagens: de 1 a 10 URLs com esquema `https`.

O sistema SHALL NOT validar faixa de preço por categoria, pois isso é responsabilidade da moderação.

#### Scenario: Título curto
- **WHEN** o título tem menos de 10 caracteres depois de remover os espaços das pontas
- **THEN** a requisição é recusada e o erro aponta o campo título

#### Scenario: Título com espaços nas pontas
- **WHEN** o título tem 10 caracteres úteis cercados de espaços
- **THEN** o anúncio é criado com o título sem os espaços das pontas

#### Scenario: Preço inválido
- **WHEN** o preço é zero, negativo, decimal ou texto
- **THEN** a requisição é recusada e o erro aponta o campo preço

#### Scenario: Categoria desconhecida
- **WHEN** a categoria não é uma das seis permitidas
- **THEN** a requisição é recusada e o erro aponta o campo categoria

#### Scenario: Imagens fora dos limites
- **WHEN** a lista de imagens está vazia, tem mais de 10 itens ou contém uma URL que não é `https`
- **THEN** a requisição é recusada e o erro aponta o campo imagens

#### Scenario: Preço fora da faixa da categoria
- **WHEN** o preço é positivo mas absurdo para a categoria
- **THEN** o anúncio é criado normalmente

### Requirement: Edição parcial com validação do resultado
A edição SHALL aceitar qualquer subconjunto dos campos de conteúdo. O conteúdo resultante da mistura entre o atual e o informado MUST passar pelas mesmas validações da criação. A resposta MUST informar o identificador do anúncio, a versão editada ou criada e o status.

#### Scenario: Alterar só o preço
- **WHEN** o dono envia apenas um novo preço válido
- **THEN** o preço é atualizado e os demais campos permanecem

#### Scenario: Edição inválida
- **WHEN** o dono envia um valor que viola uma validação
- **THEN** a edição é recusada e nenhuma versão é criada nem alterada

#### Scenario: Edição vazia
- **WHEN** o dono envia uma edição sem nenhum campo
- **THEN** a requisição é recusada como inválida

### Requirement: Apenas o dono escreve
Editar, enviar para revisão e arquivar MUST ser permitidos somente ao vendedor dono do anúncio. Para outro vendedor, o anúncio MUST se comportar como inexistente.

#### Scenario: Edição por outro vendedor
- **WHEN** um vendedor tenta editar o anúncio de outro
- **THEN** a resposta é a mesma de um anúncio inexistente e nada é alterado

#### Scenario: Anúncio inexistente
- **WHEN** o identificador não corresponde a nenhum anúncio
- **THEN** a resposta é de não encontrado

### Requirement: Contrato documentado
Os endpoints de escrita MUST estar descritos no Swagger, com esquema de autenticação, corpos, respostas de sucesso e erros (400, 401, 404 e 409).

#### Scenario: Swagger
- **WHEN** a documentação da API é consultada
- **THEN** criar, editar, enviar para revisão e arquivar aparecem com seus contratos e exigem autenticação Bearer
