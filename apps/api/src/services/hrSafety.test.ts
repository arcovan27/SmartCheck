import assert from "node:assert/strict";
import test from "node:test";
import { EmployeeOccurrenceType, OccurrenceStatus } from "@prisma/client";
import { departmentDeletionBlockers, inclusiveDateRange, occurrenceCountsInIndicators, occurrenceIndicatorBucket } from "./hrSafety.js";

test("periodo civil e inclusivo no fuso de Sao Paulo", () => {
  const range = inclusiveDateRange("2026-07-01", "2026-07-31", "America/Sao_Paulo");
  assert.equal(range.start.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(range.endExclusive.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(range.endInclusive.toISOString(), "2026-08-01T02:59:59.999Z");
});

test("periodo rejeita ordem invertida e intervalo excessivo", () => {
  assert.throws(() => inclusiveDateRange("2026-08-01", "2026-07-01"), /Periodo invalido/);
  assert.throws(() => inclusiveDateRange("2020-01-01", "2026-01-01"), /maximo dois anos/);
});

test("ocorrencias rejeitadas, canceladas ou excluidas nao entram nos indicadores", () => {
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.PENDENTE), true);
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.EM_ANALISE), true);
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.APROVADO), true);
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.REJEITADO), false);
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.CANCELADO), false);
  assert.equal(occurrenceCountsInIndicators(OccurrenceStatus.APROVADO, new Date()), false);
});

test("tipos de frequencia ambiguos sao classificados por codigo interno unico", () => {
  assert.equal(occurrenceIndicatorBucket({ type: EmployeeOccurrenceType.AFASTAMENTO, frequencyCode: "ACID_TRAB" }), "WORK_ACCIDENT");
  assert.equal(occurrenceIndicatorBucket({ type: EmployeeOccurrenceType.AFASTAMENTO, frequencyCode: "SUSP" }), "SUSPENSION");
  assert.equal(occurrenceIndicatorBucket({ type: EmployeeOccurrenceType.ADVERTENCIA, frequencyCode: "ADVERT" }), "WARNING");
  assert.equal(occurrenceIndicatorBucket({ type: EmployeeOccurrenceType.FALTA, isJustified: true }), "JUSTIFIED_ABSENCE");
  assert.equal(occurrenceIndicatorBucket({ type: EmployeeOccurrenceType.FALTA, isJustified: false }), "UNJUSTIFIED_ABSENCE");
});

test("exclusao de setor exige transferencia e bloqueia vinculos operacionais", () => {
  const employeesOnly = { activeEmployees: 3, activeTeams: 0, activeAssignments: 0, futureSchedules: 0 };
  assert.deepEqual(departmentDeletionBlockers(employeesOnly, false), ["activeEmployees"]);
  assert.deepEqual(departmentDeletionBlockers(employeesOnly, true), []);
  assert.deepEqual(departmentDeletionBlockers({ ...employeesOnly, activeAssignments: 1 }, true), ["activeAssignments"]);
  assert.deepEqual(departmentDeletionBlockers({ activeEmployees: 0, activeTeams: 1, activeAssignments: 0, futureSchedules: 2 }, false), ["activeTeams", "futureSchedules"]);
});
