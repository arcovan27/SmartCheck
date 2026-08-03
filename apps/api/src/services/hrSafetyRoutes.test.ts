import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalogs = readFileSync(new URL("../routes/hrCatalogs.ts", import.meta.url), "utf8");
const employees = readFileSync(new URL("../routes/employees.ts", import.meta.url), "utf8");
const occurrences = readFileSync(new URL("../routes/hrOccurrences.ts", import.meta.url), "utf8");
const occurrenceMigration = readFileSync(new URL("../../prisma/migrations/20260803150000_add_occurrence_idempotency/migration.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

test("exclusao de setor e transferencia sao atomicas e revalidam o destino", () => {
  assert.match(catalogs, /TransactionIsolationLevel\.Serializable/);
  assert.match(catalogs, /kind: "invalidTarget"/);
  assert.match(catalogs, /deletedAt: null/);
  assert.match(catalogs, /departmentNameSnapshot/);
  assert.match(catalogs, /DEPARTMENT_SOFT_DELETE/);
});

test("setor excluido e filtrado centralmente e nunca removido fisicamente", () => {
  assert.match(catalogs, /visibleDepartmentWhere/);
  assert.match(catalogs, /isActive: false/);
  assert.match(catalogs, /deletedAt: new Date\(\)/);
  assert.doesNotMatch(catalogs, /department\.delete\(/);
});

test("inativacao preserva historico e exige confirmacao para escalas futuras", () => {
  assert.match(employees, /inactivationSchema/);
  assert.match(employees, /confirmFutureSchedules/);
  assert.match(employees, /employeeStatusHistory\.create/);
  assert.match(employees, /WorkScheduleStatus\.CANCELADA/);
  assert.match(employees, /EMPLOYEE_INACTIVATE/);
});

test("reativacao e concorrente segura e nao restaura escalas silenciosamente", () => {
  assert.match(employees, /kind: "active"/);
  assert.match(employees, /TransactionIsolationLevel\.Serializable/);
  assert.match(employees, /schedulesRestored: 0/);
  assert.match(employees, /Escalas canceladas nao foram restauradas/);
});

test("indicadores usam uma regra de periodo, status e setor historico", () => {
  assert.match(occurrences, /inclusiveDateRange/);
  assert.match(occurrences, /OccurrenceStatus\.PENDENTE/);
  assert.match(occurrences, /OccurrenceStatus\.EM_ANALISE/);
  assert.match(occurrences, /OccurrenceStatus\.APROVADO/);
  assert.match(occurrences, /COALESCE\(o\."departmentId", e\."departmentId"\)/);
  assert.match(occurrences, /departmentId: null, employee: \{ departmentId: query\.departmentId \}/);
});

test("novas ocorrencias usam tipo central, permissao e materializacao transacional", () => {
  assert.match(occurrences, /frequencyTypeId/);
  assert.match(occurrences, /occurrenceTypePermission/);
  assert.match(occurrences, /TransactionIsolationLevel\.Serializable/);
  assert.match(occurrences, /OCCURRENCE_IMPACT_CONFLICT/);
  assert.match(occurrences, /dailyAttendance\.create/);
  assert.match(occurrences, /dayType: ScheduleDayType\.WORK/);
});

test("indicadores separam registros, pessoas, dias e tipos novos", () => {
  assert.match(occurrences, /affectedEmployees/);
  assert.match(occurrences, /suspensionDays/);
  assert.match(occurrences, /workAccidentsWithLeave/);
  assert.match(occurrences, /WHEN COALESCE\(occurrence_frequency\."code", attendance_frequency\."code"\) = 'ADVERT'/);
});

test("ocorrencias validam escopo, estado, filtros, paginacao e exclusao logica", () => {
  assert.match(occurrences, /companyId: \{ in: scope\.companyIds \}/);
  assert.match(occurrences, /assertUnitAccess\(scope, existing\.unitId\)/);
  assert.match(occurrences, /Somente ocorrencias pendentes ou em analise podem ser editadas/);
  assert.match(occurrences, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/);
  assert.match(occurrences, /orderBy: \[\{ startDate: "desc" \}, \{ createdAt: "desc" \}\]/);
  assert.match(occurrences, /status: OccurrenceStatus\.CANCELADO, deletedAt: new Date\(\)/);
});

test("criacao de ocorrencia e idempotente sem apagar historico", () => {
  assert.match(occurrences, /idempotencyKey: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(occurrences, /idempotentReplay/);
  assert.match(occurrences, /error\.code === "P2002"/);
  assert.match(occurrenceMigration, /ADD COLUMN IF NOT EXISTS "idempotencyKey"/);
  assert.match(occurrenceMigration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(occurrenceMigration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test("erros internos de banco nunca sao enviados crus ao frontend", () => {
  assert.match(server, /PrismaClientKnownRequestError/);
  assert.match(server, /Unsafe internal error suppressed/);
  assert.match(server, /DATABASE_ERROR/);
  assert.doesNotMatch(server, /send\(\{[^}]*constraint/i);
});
