# SmartCheck Biometric Agent (Windows)

Agente local para Windows que roda em `http://127.0.0.1:4100` e integra com a API do SmartCheck.

## O que ele faz
1. Recebe comando local do navegador (tela de Funcionarios).
2. Chama a API SmartCheck:
`/biometric/enroll/start` e `/biometric/enroll/finish`.
3. Retorna o `biometricExternalId` para a interface.

## Iniciar no Windows
No diretorio raiz do projeto:

```powershell
npm install
npm run dev -w @smartcheck/agent-biometric
```

Saida esperada:
`[smartcheck-agent] rodando em http://127.0.0.1:4100`

## Variaveis opcionais
- `AGENT_PORT` (padrao `4100`)
- `AGENT_HOST` (padrao `127.0.0.1`)
- `AGENT_ALLOWED_ORIGINS` (padrao `*`)

Exemplo:

```powershell
$env:AGENT_ALLOWED_ORIGINS="http://192.168.2.100:5175"; npm run dev -w @smartcheck/agent-biometric
```

## Endpoints locais
- `GET /health`
- `POST /enroll`
- `POST /identify`

## Observacao importante
Esta versao entrega o fluxo funcional de cadastro biometrico no Windows via agente local.
A captura real do hardware U.are.U 4500 pode ser plugada no agente depois, substituindo a geracao do `biometricExternalId`.
