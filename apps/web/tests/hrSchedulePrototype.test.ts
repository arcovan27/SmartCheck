import assert from "node:assert/strict";
import test from "node:test";
import { buildPrototypeCells, prototypeEmployees, prototypeFrequencies, prototypeShifts } from "../src/pages/hr/hrSchedulePrototypeData";

test("protótipo mensal mantém planejamento e realizado em camadas separadas", () => {
  const cells = buildPrototypeCells();
  assert.equal(Object.keys(cells).length, prototypeEmployees.length * 31);
  assert.equal(cells["emp-1-3"].planned?.kind, "WORK");
  assert.equal(cells["emp-1-3"].actual?.frequencyId, "freq-certificate");
});

test("protótipo representa funcionário sem escala sem apagar o realizado", () => {
  const cells = buildPrototypeCells();
  assert.equal(cells["emp-8-29"].planned, undefined);
  assert.equal(cells["emp-8-29"].actual?.frequencyId, "freq-worked");
});

test("códigos internos do protótipo são únicos e não reutilizam AD", () => {
  const codes = prototypeFrequencies.map((frequency) => frequency.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(codes.includes("AD"), false);
});

test("turno noturno registra explicitamente a virada de dia", () => {
  const nightShift = prototypeShifts.find((shift) => shift.code === "T-B");
  assert.equal(nightShift?.start, "18:00");
  assert.equal(nightShift?.end, "06:00");
  assert.equal(nightShift?.crossesMidnight, true);
});
