import assert from "node:assert/strict";
import test from "node:test";
import {
  checklistReadingsForResponse,
  validateChecklistReadings,
  validateReadingProgression
} from "./checklistReadings.js";

test("modo NONE preserva compatibilidade com execucoes sem leitura", () => {
  assert.deepEqual(validateChecklistReadings("NONE", {}), {
    hourmeterValue: null,
    mileageValue: null
  });
});

test("modo HOURMETER exige somente horimetro", () => {
  assert.deepEqual(validateChecklistReadings("HOURMETER", { hourmeterValue: 125.5 }), {
    hourmeterValue: 125.5,
    mileageValue: null
  });
  assert.throws(
    () => validateChecklistReadings("HOURMETER", {}),
    /Informe o horimetro atual/
  );
});

test("modo MILEAGE exige somente quilometragem", () => {
  assert.deepEqual(validateChecklistReadings("MILEAGE", { mileageValue: 45000 }), {
    hourmeterValue: null,
    mileageValue: 45000
  });
  assert.throws(
    () => validateChecklistReadings("MILEAGE", {}),
    /Informe a quilometragem atual/
  );
});

test("modo BOTH exige as duas leituras", () => {
  assert.deepEqual(
    validateChecklistReadings("BOTH", { hourmeterValue: 10.25, mileageValue: 200.5 }),
    { hourmeterValue: 10.25, mileageValue: 200.5 }
  );
  assert.throws(
    () => validateChecklistReadings("BOTH", { hourmeterValue: 10 }),
    /Informe a quilometragem atual/
  );
});

test("rejeita valores negativos e mais de duas casas decimais", () => {
  assert.throws(
    () => validateChecklistReadings("HOURMETER", { hourmeterValue: -1 }),
    /nao pode ser negativo/
  );
  assert.throws(
    () => validateChecklistReadings("MILEAGE", { mileageValue: 1.234 }),
    /no maximo 2 casas decimais/
  );
});

test("rejeita leitura inferior e permite leitura igual", () => {
  assert.doesNotThrow(() => validateReadingProgression("Horimetro atual", 100, [90, 100]));
  assert.throws(
    () => validateReadingProgression("Horimetro atual", 99.99, [90, 100]),
    /nao pode ser inferior/
  );
});

test("serializa tipo e unidade sem alterar campos historicos", () => {
  assert.deepEqual(checklistReadingsForResponse({ hourmeterValue: 12.5, mileageValue: 1000 }), [
    { type: "HOURMETER", value: 12.5, unit: "h" },
    { type: "MILEAGE", value: 1000, unit: "km" }
  ]);
  assert.deepEqual(checklistReadingsForResponse({ hourmeterValue: null, mileageValue: null }), []);
});
