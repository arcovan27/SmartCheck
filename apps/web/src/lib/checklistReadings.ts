export type ChecklistReadingMode = "NONE" | "HOURMETER" | "MILEAGE" | "BOTH";

export const checklistReadingModeLabels: Record<ChecklistReadingMode, string> = {
  NONE: "Nao solicitar leitura",
  HOURMETER: "Solicitar horimetro",
  MILEAGE: "Solicitar quilometragem",
  BOTH: "Solicitar ambos"
};

export function requiresHourmeter(mode: ChecklistReadingMode) {
  return mode === "HOURMETER" || mode === "BOTH";
}

export function requiresMileage(mode: ChecklistReadingMode) {
  return mode === "MILEAGE" || mode === "BOTH";
}

function parseReading(rawValue: string, label: string, required: boolean) {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return required ? { value: null, error: `Informe ${label.toLowerCase()}.` } : { value: null };
  }

  const normalizedValue = trimmedValue.replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
    return { value: null, error: `${label} deve ser numerico, nao negativo e ter no maximo 2 casas decimais.` };
  }

  const value = Number(normalizedValue);
  if (!Number.isFinite(value) || value < 0) {
    return { value: null, error: `${label} deve ser um numero nao negativo valido.` };
  }

  return { value };
}

export function validateReadingForm(
  mode: ChecklistReadingMode,
  hourmeterInput: string,
  mileageInput: string
) {
  const hourmeter = parseReading(hourmeterInput, "Horimetro atual", requiresHourmeter(mode));
  const mileage = parseReading(mileageInput, "Quilometragem atual", requiresMileage(mode));

  return {
    hourmeterValue: hourmeter.value,
    mileageValue: mileage.value,
    errors: [hourmeter.error, mileage.error].filter((error): error is string => Boolean(error))
  };
}

export function formatChecklistReadings(values: {
  hourmeterValue?: number | null;
  mileageValue?: number | null;
}) {
  const readings: string[] = [];
  const formatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  if (values.hourmeterValue !== null && values.hourmeterValue !== undefined) {
    readings.push(`Horimetro: ${formatter.format(values.hourmeterValue)} h`);
  }
  if (values.mileageValue !== null && values.mileageValue !== undefined) {
    readings.push(`Quilometragem: ${formatter.format(values.mileageValue)} km`);
  }

  return readings;
}
