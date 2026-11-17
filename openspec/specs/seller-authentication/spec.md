# seller-authentication Specification

## Purpose
Define como os endpoints de escrita identificam o vendedor por um token JWT HS256, cujo `sub` é o identificador do vendedor.

## Requirements

### Requirement: Escrita exige token válido
Os endpoints de escrita SHALL exigir um token JWT HS256 no cabeçalho `Authorization: Bearer`. Token ausente, malformado, com assinatura inválida, expirado ou assinado com outro algoritmo MUST resultar em não autorizado, sem executar a operação.

#### Scenario: Sem token
- **WHEN** uma requisição de escrita chega sem `Authorization`
- **THEN** a resposta é não autorizado

#### Scenario: Assinatura inválida
- **WHEN** o token foi assinado com outro segredo
- **THEN** a resposta é não autorizado

#### Scenario: Token expirado
- **WHEN** o token está expirado
- **THEN** a resposta é não autorizado

#### Scenario: Algoritmo diferente
- **WHEN** o token usa um algoritmo diferente de HS256, incluindo `none`
- **THEN** a resposta é não autorizado

#### Scenario: Token válido
- **WHEN** o token é válido
- **THEN** a operação prossegue em nome do vendedor identificado pelo `sub`

### Requirement: Identidade do vendedor vem do `sub`
O identificador do vendedor MUST ser o `sub` do token, que MUST ser um texto não vazio. Um token válido sem `sub` utilizável MUST ser tratado como não autorizado.

#### Scenario: Token sem `sub`
- **WHEN** o token é válido mas não tem `sub`
- **THEN** a resposta é não autorizado

### Requirement: Segredo obrigatório e forte
A aplicação MUST recusar iniciar sem o segredo de assinatura configurado, ou com um segredo de menos de 32 caracteres.

#### Scenario: Segredo ausente
- **WHEN** a aplicação inicia sem o segredo
- **THEN** o processo falha no boot com uma mensagem de configuração inválida

### Requirement: Emissão de token por script
O projeto SHALL oferecer um script que emite um token para um identificador de vendedor informado, assinado com o segredo configurado e com expiração.

#### Scenario: Emitir token
- **WHEN** o script é executado com um identificador de vendedor
- **THEN** imprime um token aceito pela API que identifica esse vendedor

#### Scenario: Sem identificador
- **WHEN** o script é executado sem identificador
- **THEN** termina com erro e instruções de uso
