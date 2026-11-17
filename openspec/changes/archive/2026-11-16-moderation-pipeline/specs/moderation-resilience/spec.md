# Spec Delta

## Purpose

Define o comportamento do pipeline de moderação diante da instabilidade do serviço externo: o que é tentado de novo, o que é definitivo e o que nunca pode virar reprovação.

## ADDED Requirements

### Requirement: Transient errors are retried with backoff
O sistema SHALL repetir a chamada, com espera exponencial e jitter, quando o serviço responde `5xx` ou excede o tempo limite, até o número configurado de tentativas.

#### Scenario: Erro 500 seguido de sucesso
- **WHEN** o serviço responde `500` na primeira tentativa e aprova na segunda
- **THEN** a versão é publicada e a auditoria não registra falha

#### Scenario: Tempo limite
- **WHEN** o serviço não responde dentro do tempo limite configurado
- **THEN** a tentativa conta como falha transitória e é repetida

### Requirement: Rate limiting pauses without consuming attempts
O sistema SHALL, ao receber `429`, pausar o consumo respeitando `Retry-After` e SHALL NOT contar a pausa como tentativa do job.

#### Scenario: Resposta 429
- **WHEN** o serviço responde `429` com `Retry-After: 1`
- **THEN** o consumo pausa por ao menos 1 segundo e o job volta à fila com o contador de tentativas inalterado

### Requirement: Outbound throughput is limited
O sistema SHALL limitar o total de chamadas ao serviço de moderação ao máximo configurado por segundo (padrão 5), somando todos os consumidores.

#### Scenario: Rajada de envios
- **WHEN** 20 versões são enviadas ao mesmo tempo
- **THEN** o serviço recebe no máximo 5 chamadas por segundo e todas as versões são moderadas

### Requirement: Circuit breaker protects the service
O sistema SHALL abrir um circuito quando a taxa de falhas atingir o limite configurado (padrão 50%, mínimo de 5 chamadas) e, enquanto aberto, não chamar o serviço; após o intervalo configurado, SHALL deixar passar chamadas de teste.

#### Scenario: Circuito aberto
- **WHEN** o circuito está aberto e um job é processado
- **THEN** o serviço não é chamado, o consumo pausa até o circuito poder testar de novo e o job não consome tentativa

#### Scenario: Recuperação
- **WHEN** o intervalo de abertura passa e a chamada de teste tem sucesso
- **THEN** o circuito fecha e o consumo segue normalmente

### Requirement: Invalid payload is not retried
O sistema SHALL tratar `400` do serviço como falha definitiva, sem repetir a chamada.

#### Scenario: Resposta 400
- **WHEN** o serviço responde `400`
- **THEN** o job falha de imediato, sem novas tentativas

### Requirement: Integration failure never rejects a listing
Falhas de integração (tentativas esgotadas, `400`) SHALL NOT mover a versão para `rejected`: ela permanece `in_review` e a falha é registrada na auditoria.

#### Scenario: Tentativas esgotadas
- **WHEN** todas as tentativas falham com `500`
- **THEN** a versão continua `in_review`, o job fica registrado como falho e a auditoria ganha um evento de falha de moderação com o erro

### Requirement: Behavior is configurable
Tempo limite, tentativas, espera inicial do backoff, limite por segundo, concorrência, parâmetros do circuito e intervalo de polling do outbox SHALL ser configuráveis por variáveis de ambiente, com padrões compatíveis com o mock.

#### Scenario: Valor inválido
- **WHEN** uma variável de configuração tem valor inválido
- **THEN** o processo falha na inicialização com mensagem clara
