# SmartCheck

Plataforma web para gestão operacional industrial com foco em checklists, manutenção, EPI e rastreabilidade de operação.

## Stack
- Backend: Node.js + Fastify
- ORM: Prisma
- Banco: PostgreSQL
- Frontend: React + Vite + TailwindCSS
- Arquitetura: monorepo (`apps/api`, `apps/web`, `apps/agent-biometric`)
- Infra: Docker Compose

## Estrutura
- `apps/api`: API Fastify + Prisma + upload de anexos
- `apps/web`: aplicação web responsiva
- `apps/agent-biometric`: placeholder para agente local Windows/.NET
- `docs/reference-form-model.md`: referência de domínio operacional

## Módulos
- Dashboard operacional
- Funcionários (cadastro, edição, ativação/inativação, vínculo de biometria)
- Usuários e perfis (`ADMIN`, `MANUTENCAO`, `OPERADOR`, `SEGURANCA_DO_TRABALHO`, `ALMOXARIFADO`)
- EPI (cadastro, estoque, entrega/devolução, ficha por funcionário)
- Equipamentos e veículos
- Modelos e execuções de checklist
- Manutenção corretiva e preventiva
- Planos e alertas de manutenção

## Rodar com Docker
```bash
docker compose up --build
```

Acessos:
- Web: `http://localhost:5173`
- API: `http://localhost:3333`
- Health: `http://localhost:3333/health`

## Rodar local
```bash
npm install
copy apps\api\.env.example apps\api\.env
npm run prisma:generate -w @smartcheck/api
npm run prisma:deploy -w @smartcheck/api
npm run seed -w @smartcheck/api
npm run dev -w @smartcheck/api
npm run dev -w @smartcheck/web
```

## Credenciais seed
- Admin: `admin@smartcheck.local / admin123`
- Manutenção: `manutencao@smartcheck.local / smart123`
- Operador: `operador@smartcheck.local / smart123`
- SST: `sst@smartcheck.local / smart123`
- Almoxarifado: `almoxarifado@smartcheck.local / smart123`
