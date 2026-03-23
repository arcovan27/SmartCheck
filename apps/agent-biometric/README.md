# SmartCheck Biometric Agent (Windows/.NET)

Agente local Windows em .NET 8 para integrar o leitor U.are.U 4500 mantendo a API local:
- `GET /health`
- `POST /enroll`
- `POST /identify`

## Experiencia para o cliente final
Depois de gerar o instalador e executar o setup:
- o agente instala e inicia automaticamente
- cria atalho no menu iniciar
- entra na inicializacao automatica do Windows
- fica pronto para uso sem precisar PowerShell

## Gerar instalador (Inno Setup)
Requisitos:
- .NET 8 SDK
- Inno Setup 6 (com `ISCC.exe` no PATH ou instalado em `C:\Program Files (x86)\Inno Setup 6`)

Comando unico para gerar instalador:

```powershell
npm run installer -w @smartcheck/agent-biometric
```

Saidas geradas:
- Publicacao Windows: `apps/agent-biometric/dist/win-x64`
- Instalador `.exe`: `apps/agent-biometric/dist/installer`

Se quiser apenas publicar sem empacotar:

```powershell
npm run publish:win -w @smartcheck/agent-biometric
```

## SDK U.are.U sem configuracao manual no cliente
No build do instalador, o script tenta embutir automaticamente o SDK (`DPUruNet.dll`) no pacote:
1. Pasta informada por `-SdkDllDir`
2. `UAREU_SDK_DLL_DIR`
3. Pastas comuns em `Program Files`

Em runtime, o agente tambem tenta localizar automaticamente o SDK em:
- pasta `sdk` ao lado do executavel
- pasta do proprio agente
- caminhos comuns do Windows

## Rodar em desenvolvimento
```powershell
npm run dev -w @smartcheck/agent-biometric
```

Padrao de execucao local:
- Host: `127.0.0.1`
- Porta: `4100`

## Variaveis de ambiente (opcionais)
- `AGENT_HOST` (padrao `127.0.0.1`)
- `AGENT_PORT` (padrao `4100`)
- `AGENT_ALLOWED_ORIGINS` (padrao `*`)
- `SMARTCHECK_BIOMETRIC_MODE` (`sdk` padrao, ou `mock`)
- `UAREU_SDK_DLL_DIR` (opcional)
- `AGENT_DATA_DIR` (opcional)

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
