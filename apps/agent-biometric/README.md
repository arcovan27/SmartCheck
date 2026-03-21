# Agent Biometric (placeholder)

Módulo reservado para o agente local em Windows/.NET que fará integração com leitor biométrico (ex.: U.are.U 4500).

Fluxo esperado:
1. Agente local captura/identifica digital.
2. Agente chama API SmartCheck (`/biometric/identify`, `/biometric/enroll/start`, `/biometric/enroll/finish`).
3. API retorna funcionário identificado para autorização de fluxos (EPI, confirmação de recebimento, posto operacional).

Nenhuma captura biométrica direta é feita no navegador.
