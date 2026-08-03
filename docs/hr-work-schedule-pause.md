# Pausa reversível da Escala e continuidade de Ocorrências

## Estado padrão

A Escala de trabalho permanece desabilitada quando as variáveis não existem ou têm qualquer valor diferente de `true`:

- API: `HR_WORK_SCHEDULE_ENABLED=false`
- frontend (em tempo de build): `VITE_HR_WORK_SCHEDULE_ENABLED=false`

A API mantém leituras históricas necessárias a outros fluxos. Criação e alteração de escalas, turnos, padrões, períodos e importações retornam `503` com o código funcional `WORK_SCHEDULE_DISABLED`.

## Ativação controlada

1. Homologar a API e o frontend com ambas as flags em `true`.
2. Executar os testes de Escala e Ocorrências.
3. Validar permissões e isolamento por empresa/unidade.
4. Obter autorização explícita antes de build/deploy em produção.
5. Disponibilizar a variável `VITE_...` durante o build do frontend; alterar somente a variável de runtime da API não reexibe a interface.

## Rollback operacional

1. Definir `HR_WORK_SCHEDULE_ENABLED=false` na API.
2. Gerar o frontend com `VITE_HR_WORK_SCHEDULE_ENABLED=false`.
3. Revalidar que a rota direta mostra a mensagem neutra e que mutações retornam `WORK_SCHEDULE_DISABLED`.

Nenhuma tabela, migration, escala ou registro histórico é removido por esse rollback.

## Migration proposta para Ocorrências

O arquivo `20260803150000_add_occurrence_idempotency/migration.sql` é aditivo e não foi aplicado. Ele:

- acrescenta `SUSPENSAO` e `ACIDENTE_TRABALHO` ao enum legado;
- acrescenta a coluna opcional `idempotencyKey`;
- cria um índice único por empresa e chave para impedir reenvios duplicados.

Rollback técnico, caso a migration venha a ser autorizada e aplicada:

```sql
DROP INDEX IF EXISTS "EmployeeOccurrence_companyId_idempotencyKey_key";
ALTER TABLE "EmployeeOccurrence" DROP COLUMN IF EXISTS "idempotencyKey";
```

Os valores adicionados ao enum devem permanecer, pois removê-los do PostgreSQL exige recriação do tipo e não é necessário para o rollback funcional.
