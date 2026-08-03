import assert from "node:assert/strict";
import test from "node:test";
import { OccurrenceStatus, ScheduleDayType, ScheduleImportItemStatus, SchedulePeriodStatus } from "@prisma/client";
import {
  assertEmployeePeriod,
  assertPeriodEditable,
  attendanceDefaultStatus,
  canonicalImportHash,
  dateOnly,
  intervalForPatternDay,
  materializePattern,
  monthlyAttendanceSummary,
  plannedMinutes,
  resolveImportCode
} from "./workforceSchedules.js";

test("rejeita datas inexistentes sem normalizacao silenciosa", () => {
  assert.throws(() => dateOnly("2026-02-31"), /Data invalida/);
  assert.equal(dateOnly("2026-02-28").getUTCDate(), 28);
});

test("materializa padrao 5x2 sem codificar o nome do ciclo", () => {
  const days: Array<{ cyclePosition: number; dayType: ScheduleDayType; startMinute: number; endMinute: number; breakMinutes: number }> = [1, 2, 3, 4, 5].map((cyclePosition) => ({ cyclePosition, dayType: ScheduleDayType.WORK, startMinute: 480, endMinute: 1020, breakMinutes: 60 }));
  days.push({ cyclePosition: 6, dayType: ScheduleDayType.DAY_OFF, startMinute: 0, endMinute: 0, breakMinutes: 0 });
  days.push({ cyclePosition: 7, dayType: ScheduleDayType.DSR, startMinute: 0, endMinute: 0, breakMinutes: 0 });
  const result = materializePattern({ from: "2026-08-03", until: "2026-08-09", cycleDays: 7, days });
  assert.equal(result.length, 7);
  assert.equal(result.filter((day) => day.dayType === ScheduleDayType.WORK).length, 5);
  assert.equal(result[0].plannedMinutes, 480);
});

test("materializa ciclo 12x36 e calcula jornada noturna", () => {
  const result = materializePattern({
    from: "2026-08-01",
    until: "2026-08-04",
    cycleDays: 2,
    days: [
      { cyclePosition: 1, dayType: ScheduleDayType.WORK, startMinute: 1080, endMinute: 360, breakMinutes: 0, crossesMidnight: true },
      { cyclePosition: 2, dayType: ScheduleDayType.DAY_OFF }
    ]
  });
  assert.deepEqual(result.map((day) => day.dayType), [ScheduleDayType.WORK, ScheduleDayType.DAY_OFF, ScheduleDayType.WORK, ScheduleDayType.DAY_OFF]);
  assert.equal(result[0].plannedMinutes, 720);
  const interval = intervalForPatternDay(result[0].date, result[0]);
  assert.equal((interval.endAt.getTime() - interval.startAt.getTime()) / 3_600_000, 12);
});

test("rejeita intervalo que consome toda a jornada", () => {
  assert.throws(() => plannedMinutes(480, 540, 60), /Intervalo/);
});

test("exige indicacao explicita para jornada que atravessa meia-noite", () => {
  assert.throws(() => plannedMinutes(1320, 360, 60, false), /virada de dia/);
  assert.equal(plannedMinutes(1320, 360, 60, true), 420);
});

test("materializa padrao 6x1 com descanso configuravel", () => {
  const days = Array.from({ length: 6 }, (_, index) => ({ cyclePosition: index + 1, dayType: ScheduleDayType.WORK, startMinute: 420, endMinute: 900, breakMinutes: 60 }));
  const result = materializePattern({ from: "2026-08-01", until: "2026-08-07", cycleDays: 7, days: [...days, { cyclePosition: 7, dayType: ScheduleDayType.DSR }] });
  assert.equal(result.filter((day) => day.dayType === ScheduleDayType.WORK).length, 6);
  assert.equal(result.filter((day) => day.dayType === ScheduleDayType.DSR).length, 1);
});

test("ciclo personalizado pode omitir posicoes sem materializar totais", () => {
  const result = materializePattern({ from: "2026-08-01", until: "2026-08-05", cycleDays: 5, days: [{ cyclePosition: 2, dayType: ScheduleDayType.WORK, startMinute: 480, endMinute: 720 }, { cyclePosition: 5, dayType: ScheduleDayType.DAY_OFF }] });
  assert.deepEqual(result.map((day) => day.cyclePosition), [2, 5]);
});

test("valida periodo de vinculo do funcionario", () => {
  assert.doesNotThrow(() => assertEmployeePeriod({ isActive: true, admissionDate: new Date("2026-01-01"), dismissalDate: new Date("2026-12-31") }, new Date("2026-07-10")));
  assert.throws(() => assertEmployeePeriod({ isActive: false }, new Date("2026-07-10")), /inativo/);
  assert.throws(() => assertEmployeePeriod({ isActive: true, dismissalDate: new Date("2026-07-09") }, new Date("2026-07-10")), /desligamento/);
});

test("bloqueia competencia fechada", () => {
  assert.throws(() => assertPeriodEditable(SchedulePeriodStatus.CLOSED), /fechada/);
  assert.doesNotThrow(() => assertPeriodEditable(SchedulePeriodStatus.REOPENED));
  assert.doesNotThrow(() => assertPeriodEditable(SchedulePeriodStatus.CLOSED, true));
});

test("codigo AD exige decisao explicita e aceita resolucao individual", () => {
  assert.equal(resolveImportCode("AD", "row-1").status, ScheduleImportItemStatus.CODE_AMBIGUOUS);
  assert.deepEqual(resolveImportCode("AD", "row-1", { mode: "AUX_DOENCA" }), { status: ScheduleImportItemStatus.READY, internalCode: "AUX_DOENCA" });
  assert.equal(resolveImportCode("AD", "row-2", { mode: "INDIVIDUAL", values: { "row-1": "ADVERT" } }).status, ScheduleImportItemStatus.CODE_AMBIGUOUS);
  assert.equal(resolveImportCode("AD", "row-1", { mode: "IGNORE" }).status, ScheduleImportItemStatus.IGNORED);
});

test("hash de importacao independe da ordem das chaves", () => {
  assert.equal(canonicalImportHash({ b: 2, a: { d: 4, c: 3 } }), canonicalImportHash({ a: { c: 3, d: 4 }, b: 2 }));
});

test("status inicial respeita documento e aprovacao", () => {
  assert.equal(attendanceDefaultStatus({ requiresApproval: false, requiresDocument: false }), OccurrenceStatus.APROVADO);
  assert.equal(attendanceDefaultStatus({ requiresApproval: false, requiresDocument: true }), OccurrenceStatus.PENDENTE);
});

test("resumo mensal agrega codigos sem armazenar total materializado", () => {
  const summary = monthlyAttendanceSummary([
    { plannedMinutes: 480, frequency: { code: "TRAB", countsAsPresence: true, countsAsAbsence: false }, status: OccurrenceStatus.APROVADO },
    { plannedMinutes: 480, frequency: { code: "FALTA_INJ", countsAsPresence: false, countsAsAbsence: true }, status: OccurrenceStatus.APROVADO },
    { plannedMinutes: 0, frequency: { code: "ATEST", countsAsPresence: false, countsAsAbsence: true }, status: OccurrenceStatus.PENDENTE }
  ]);
  assert.deepEqual(summary, { byCode: { TRAB: 1, FALTA_INJ: 1, ATEST: 1 }, plannedMinutes: 960, presenceDays: 1, absenceDays: 2, pendingDays: 1 });
});
