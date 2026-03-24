# SmartCheck Biometric Agent (Java)

Agente local Windows para integrar o SmartCheck com leitores DigitalPersona U.are.U usando o SDK Java oficial.

## Requisitos

- Windows com driver/leitor DigitalPersona instalado
- SDK presente em `C:\Program Files\DigitalPersona\U.are.U SDK\Windows`
- JRE 8 em `C:\Program Files\Java\jre1.8.0_481`
- `javac.exe` disponível em `C:\Program Files\Android\Android Studio\jbr\bin\javac.exe`

## Build

```powershell
cd C:\Users\SmartNuvem\Documents\GitHub\SmartCheck\apps\agent-biometric
.\build.ps1
```

## Executar

```powershell
cd C:\Users\SmartNuvem\Documents\GitHub\SmartCheck\apps\agent-biometric
.\run-agent.ps1
```

O agente sobe em `http://127.0.0.1:4100`.

Durante captura, o console mostra qual leitor esta sendo testado e o status dele. Cada leitor recebe ate 10 segundos de tentativa antes do agente passar para o proximo.
Nao execute o sample oficial da DigitalPersona ao mesmo tempo que o agente do SmartCheck, pois dois processos concorrendo pelo leitor podem causar falha nativa.
O log persistente fica em `C:\ProgramData\SmartCheck\biometric-agent.log`.

Para acompanhar em tempo real:

```powershell
Get-Content C:\ProgramData\SmartCheck\biometric-agent.log -Wait
```

No startup, confirme no console/log a versao do build (exemplo: `Agent started (2026-03-24-capture-v2)`), para garantir que o jar atualizado foi carregado.

## Endpoints

- `GET /health`: valida se o processo subiu e lista leitores visiveis
- `POST /enroll`: inicia cadastro na API, captura a digital, salva template local e finaliza o vinculo
- `POST /identify`: captura a digital, compara localmente com os templates salvos e consulta a API principal

## Observacao importante

O template biometrico fica salvo localmente em `C:\ProgramData\SmartCheck\biometric-store.json`. Isso e necessario para a identificacao funcionar de verdade, porque capturas diferentes da mesma digital nao geram uma string identica para consulta direta na API.
