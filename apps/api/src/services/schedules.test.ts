import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduleInterval, enumerateScheduleDates, intervalsOverlap } from "./schedules.js";

test("escala que cruza a meia-noite termina no dia seguinte", () => {
  const interval = buildScheduleInterval("2026-08-03", "22:00", "06:00");
  assert.equal(interval.crossesMidnight, true);
  assert.equal((interval.endAt.getTime() - interval.startAt.getTime()) / 3_600_000, 8);
});

test("intervalos adjacentes nao entram em conflito", () => {
  const first = buildScheduleInterval("2026-08-03", "08:00", "12:00");
  const second = buildScheduleInterval("2026-08-03", "12:00", "16:00");
  assert.equal(intervalsOverlap(first.startAt, first.endAt, second.startAt, second.endAt), false);
});

test("intervalos sobrepostos entram em conflito", () => {
  const first = buildScheduleInterval("2026-08-03", "08:00", "13:00");
  const second = buildScheduleInterval("2026-08-03", "12:00", "16:00");
  assert.equal(intervalsOverlap(first.startAt, first.endAt, second.startAt, second.endAt), true);
});

test("recorrencia seleciona somente os dias informados", () => {
  assert.deepEqual(enumerateScheduleDates("2026-08-03", "2026-08-09", [1, 3, 5]), ["2026-08-03", "2026-08-05", "2026-08-07"]);
});
