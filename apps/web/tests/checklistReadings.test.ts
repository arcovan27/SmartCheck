import assert from "node:assert/strict";
import test from "node:test";
import { formatChecklistReadings, validateReadingForm } from "../src/lib/checklistReadings";

test("frontend valida os quatro modos de leitura", () => {
  assert.equal(validateReadingForm("NONE", "", "").errors.length, 0);
  assert.equal(validateReadingForm("HOURMETER", "", "").errors.length, 1);
  assert.equal(validateReadingForm("MILEAGE", "", "").errors.length, 1);
  assert.equal(validateReadingForm("BOTH", "", "").errors.length, 2);
});

test("frontend rejeita letras, negativos e precisao invalida", () => {
  assert.equal(validateReadingForm("HOURMETER", "abc", "").errors.length, 1);
  assert.equal(validateReadingForm("HOURMETER", "-1", "").errors.length, 1);
  assert.equal(validateReadingForm("MILEAGE", "", "10.123").errors.length, 1);
});

test("frontend aceita zero, duas casas e virgula decimal", () => {
  assert.equal(validateReadingForm("HOURMETER", "0", "").hourmeterValue, 0);
  assert.equal(validateReadingForm("MILEAGE", "", "10.25").mileageValue, 10.25);
  assert.equal(validateReadingForm("BOTH", "1,5", "20,75").errors.length, 0);
});

test("historico formata unidades e preserva registros antigos", () => {
  assert.deepEqual(formatChecklistReadings({ hourmeterValue: 12.5, mileageValue: 1000 }), [
    "Horimetro: 12,5 h",
    "Quilometragem: 1.000 km"
  ]);
  assert.deepEqual(formatChecklistReadings({}), []);
});
