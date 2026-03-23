# SmartCheck Biometric Agent (Windows/.NET)

Agente local Windows em .NET 8 para integrar o leitor U.are.U 4500 mantendo a API local:
- `GET /health`
- `POST /enroll`
- `POST /identify`

## Rodar no Windows
No diretorio raiz do projeto:

```powershell
npm run dev -w @smartcheck/agent-biometric
```

Padrao de execucao local:
- Host: `127.0.0.1`
- Porta: `4100`

## Configurar SDK U.are.U
1. Instale driver e SDK da DigitalPersona/HID no Windows.
2. Garanta acesso ao arquivo `DPUruNet.dll`.
3. Aponte a pasta do SDK antes de iniciar o agente:

```powershell
$env:UAREU_SDK_DLL_DIR="C:\SDK\UareU\Lib\NET"; npm run dev -w @smartcheck/agent-biometric
```

Se `DPUruNet.dll` nao for encontrada, o agente entra automaticamente em modo `mock`.

## Variaveis de ambiente
- `AGENT_HOST` (padrao `127.0.0.1`)
- `AGENT_PORT` (padrao `4100`)
- `AGENT_ALLOWED_ORIGINS` (padrao `*`)
- `SMARTCHECK_BIOMETRIC_MODE` (`sdk` padrao, ou `mock`)
- `UAREU_SDK_DLL_DIR` (pasta onde esta `DPUruNet.dll`)
- `AGENT_DATA_DIR` (pasta para cache local de templates)

## Fluxo de cadastro biometrico
1. Frontend chama `POST /enroll` no agente local.
2. Agente chama API SmartCheck:
- `/biometric/enroll/start`
- captura template no leitor
- `/biometric/enroll/finish`
3. API marca biometria como cadastrada.

## Endpoint de saude
```powershell
Invoke-WebRequest http://127.0.0.1:4100/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Retorna `mode`, `sdkReady` e `lastError` para diagnostico rapido.

## Legado (Node)
Se precisar usar a versao antiga temporariamente:

```powershell
npm run dev:legacy-node -w @smartcheck/agent-biometric
```
