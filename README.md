# SmartCheck

Plataforma web para gestão operacional industrial com base em formulários reais de checklist e controle de EPI.

## Stack
- Backend: Node.js, Fastify, Prisma ORM, PostgreSQL
- Frontend: React + Vite + TailwindCSS
- Arquitetura: monorepo (`apps/api`, `apps/web`, `apps/agent-biometric`)
- Infra: Docker Compose

## Estrutura
- `apps/api`: API Fastify + Prisma + upload de fotos
- `apps/web`: painel web mobile-first
- `apps/agent-biometric`: placeholder para agente .NET do leitor biométrico
- `docs/reference-form-model.md`: mapeamento dos formulários enviados

## Funcionalidades implementadas
- Autenticação com JWT e perfis (`ADMIN`, `MAINTENANCE`, `OPERATOR`, `SAFETY`)
- Funcionários com vínculo de biometria (template)
- Controle de EPI com histórico por funcionário
- Cadastro de equipamentos (máquina/veículo)
- Modelos de checklist por equipamento com periodicidade
- Execução de checklist com:
  - respostas rápidas (`OK/Problema/N/A`, `Sim/Não`, número, texto)
  - foto obrigatória no problema
  - descrição obrigatória no problema
  - abertura automática de manutenção corretiva
- Manutenção preventiva/corretiva com status e prioridade
- Planos de preventiva por dias, KM ou horímetro com alertas (`OK`, `NEAR`, `DUE`)
- Histórico por equipamento (checklists + manutenções + planos)
- Endpoint de integração biométrica: `POST /biometric/identify`

## Rodar com Docker (recomendado)
1. No diretório raiz:
```bash
docker compose up --build
```
2. Acessos:
- Web: `http://localhost:5173`
- API: `http://localhost:3333`
- Health: `http://localhost:3333/health`

## Rodar local sem Docker
1. Instale dependências:
```bash
npm install
```
2. Copie variáveis de ambiente:
```bash
copy apps\api\.env.example apps\api\.env
```
3. Suba PostgreSQL local e ajuste `DATABASE_URL`.
4. Gere Prisma + banco + seed:
```bash
npm run prisma:generate -w @smartcheck/api
npm run prisma:deploy -w @smartcheck/api
npm run seed -w @smartcheck/api
```
5. Suba API e Web em terminais separados:
```bash
npm run dev -w @smartcheck/api
npm run dev -w @smartcheck/web
```

## Credenciais iniciais (seed)
- Email: `admin@smartcheck.local`
- Senha: `admin123`

## Principais rotas da API
- `POST /auth/login`
- `GET /auth/me`
- `GET/POST/PATCH /employees`
- `GET/POST /epis`
- `GET/POST /epi-deliveries`
- `GET/POST/PATCH /equipments`
- `GET/POST /checklist-templates`
- `GET/POST /checklist-executions`
- `GET/POST/PATCH /maintenances`
- `GET/POST /maintenance-plans`
- `GET /maintenance-alerts`
- `GET /history/equipment/:equipmentId`
- `POST /uploads`
- `POST /biometric/identify`

## Observações de design
- UX mobile-first com botões grandes para operação no chão de fábrica.
- A lógica dos formulários foi preservada e digitalizada com validações críticas de operação.
- A estrutura já está preparada para evolução futura de modo offline.
