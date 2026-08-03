import assert from "node:assert/strict";
import test from "node:test";
import { EmployeeOccurrenceType, HrPermission } from "@prisma/client";
import { calendarDayCount, legacyOccurrenceType, occurrenceImpactRange, occurrenceTypePermission, validateOccurrenceBusinessRules } from "./occurrenceWorkflow.js";

const day = (value: string) => new Date(`${value}T12:00:00-03:00`);

test("codigos internos preservam compatibilidade com o enum legado", () => {
  assert.equal(legacyOccurrenceType("FALTA_INJ"), EmployeeOccurrenceType.FALTA);
  assert.equal(legacyOccurrenceType("ATEST"), EmployeeOccurrenceType.ATESTADO_MEDICO);
  assert.equal(legacyOccurrenceType("AUX_DOENCA"), EmployeeOccurrenceType.AFASTAMENTO);
  assert.equal(legacyOccurrenceType("FERIAS"), EmployeeOccurrenceType.FERIAS);
  assert.equal(legacyOccurrenceType("ADVERT"), EmployeeOccurrenceType.ADVERTENCIA);
  assert.equal(legacyOccurrenceType("SUSP"), EmployeeOccurrenceType.SUSPENSAO);
  assert.equal(legacyOccurrenceType("ACID_TRAB"), EmployeeOccurrenceType.ACIDENTE_TRABALHO);
  assert.equal(legacyOccurrenceType("OUTRO"), EmployeeOccurrenceType.OUTRO);
});

test("permissoes especificas separam advertencia, suspensao e acidente", () => {
  assert.deepEqual(occurrenceTypePermission("ADVERT"), { view: HrPermission.WARNING_VIEW, register: HrPermission.WARNING_REGISTER });
  assert.deepEqual(occurrenceTypePermission("SUSP"), { view: HrPermission.SUSPENSION_VIEW, register: HrPermission.SUSPENSION_REGISTER });
  assert.deepEqual(occurrenceTypePermission("ACID_TRAB"), { view: HrPermission.WORK_ACCIDENT_VIEW, register: HrPermission.WORK_ACCIDENT_REGISTER });
  assert.equal(occurrenceTypePermission("ATEST"), null);
});

test("advertencia nao produz intervalo de impacto na escala", () => {
  assert.equal(occurrenceImpactRange({ code: "ADVERT", startDate: day("2026-07-10") }), null);
});

test("suspensao calcula periodo inclusivo e valida datas", () => {
  const startDate = day("2026-07-10");
  const endDate = day("2026-07-12");
  assert.deepEqual(occurrenceImpactRange({ code: "SUSP", startDate, endDate }), { start: startDate, end: endDate });
  assert.equal(calendarDayCount(startDate, endDate), 3);
  assert.match(validateOccurrenceBusinessRules({ code: "SUSP", startDate, endDate: day("2026-07-09"), reasonId: null })[0], /data final/i);
});

test("acidente sem afastamento nao impacta escala e com afastamento usa periodo proprio", () => {
  const accident = day("2026-07-10");
  const leaveStart = day("2026-07-11");
  const leaveEnd = day("2026-07-13");
  assert.equal(occurrenceImpactRange({ code: "ACID_TRAB", startDate: accident, hasAccidentLeave: false }), null);
  assert.deepEqual(occurrenceImpactRange({ code: "ACID_TRAB", startDate: accident, hasAccidentLeave: true, accidentLeaveStartDate: leaveStart, accidentLeaveEndDate: leaveEnd }), { start: leaveStart, end: leaveEnd });
  assert.equal(calendarDayCount(leaveStart, leaveEnd), 3);
});

test("acidente exige dados essenciais sem exigir documento no formulario", () => {
  const errors = validateOccurrenceBusinessRules({ code: "ACID_TRAB", startDate: day("2026-07-10"), hasAccidentLeave: true });
  assert.ok(errors.some((message) => /data e hora/i.test(message)));
  assert.ok(errors.some((message) => /local do acidente/i.test(message)));
  assert.ok(errors.some((message) => /data inicial do afastamento/i.test(message)));
  assert.ok(errors.every((message) => !/documento/i.test(message)));
});
