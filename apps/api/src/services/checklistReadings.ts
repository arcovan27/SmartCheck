export const MAX_READING_DECIMAL_PLACES = 2;

export type ChecklistReadingModeValue = "NONE" | "HOURMETER" | "MILEAGE" | "BOTH";

export type ChecklistReadingValues = {
  hourmeterValue?: number | null;
  mileageValue?: number | null;
};

export class ChecklistReadingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecklistReadingValidationError";
  }
}

export function requiresHourmeter(mode: ChecklistReadingModeValue) {
  return mode === "HOURMETER" || mode === "BOTH";
}

export function requiresMileage(mode: ChecklistReadingModeValue) {
  return mode === "MILEAGE" || mode === "BOTH";
}

function validateValue(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return null;

  if (!Number.isFinite(value)) {
    throw new ChecklistReadingValidationError(`${label} deve ser um numero valido.`);
  }

  if (value < 0) {
    throw new ChecklistReadingValidationError(`${label} nao pode ser negativo.`);
  }

  const scaledValue = value * 10 ** MAX_READING_DECIMAL_PLACES;
  if (Math.abs(scaledValue - Math.round(scaledValue)) > 1e-8) {
    throw new ChecklistReadingValidationError(
      `${label} deve ter no maximo ${MAX_READING_DECIMAL_PLACES} casas decimais.`
    );
  }

  return value;
}

export function validateChecklistReadings(
  mode: ChecklistReadingModeValue,
  values: ChecklistReadingValues
) {
  const hourmeterValue = validateValue(values.hourmeterValue, "Horimetro atual");
  const mileageValue = validateValue(values.mileageValue, "Quilometragem atual");

  if (requiresHourmeter(mode) && hourmeterValue === null) {
    throw new ChecklistReadingValidationError("Informe o horimetro atual para concluir o checklist.");
  }

  if (requiresMileage(mode) && mileageValue === null) {
    throw new ChecklistReadingValidationError("Informe a quilometragem atual para concluir o checklist.");
  }

  return { hourmeterValue, mileageValue };
}

export function validateReadingProgression(
  label: string,
  nextValue: number | null,
  references: Array<number | null | undefined>
) {
  if (nextValue === null) return;

  const knownValues = references.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value)
  );
  if (knownValues.length === 0) return;

  const previousValue = Math.max(...knownValues);
  if (nextValue < previousValue) {
    throw new ChecklistReadingValidationError(
      `${label} (${nextValue.toFixed(2)}) nao pode ser inferior a ultima leitura conhecida (${previousValue.toFixed(2)}).`
    );
  }
}

export function checklistReadingsForResponse(values: ChecklistReadingValues) {
  const readings: Array<{ type: "HOURMETER" | "MILEAGE"; value: number; unit: "h" | "km" }> = [];

  if (values.hourmeterValue !== null && values.hourmeterValue !== undefined) {
    readings.push({ type: "HOURMETER", value: values.hourmeterValue, unit: "h" });
  }
  if (values.mileageValue !== null && values.mileageValue !== undefined) {
    readings.push({ type: "MILEAGE", value: values.mileageValue, unit: "km" });
  }

  return readings;
}
