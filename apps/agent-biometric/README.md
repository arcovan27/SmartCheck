# Agent Biometric (placeholder)

Este módulo está reservado para o agente de biometria em .NET (futuro) que integra com o leitor U.are.U 4500.

Contrato previsto:
- O agente identifica a digital e envia `employeeId` para `POST /biometric/identify` na API SmartCheck.
- A API retorna os dados do funcionário para autorizar fluxos (ex.: retirada de EPI).

Exemplo de payload:
```json
{
  "employeeId": "cm123..."
}
```
