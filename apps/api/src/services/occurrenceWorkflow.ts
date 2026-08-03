import { EmployeeOccurrenceType, HrPermission } from "@prisma/client";

export const occurrenceFrequencyCodes = [
  "FALTA_INJ",
  "FALTA_JUST",
  "ATEST",
  "FERIAS",
  "AUX_DOENCA",
  "ADVERT",
  "SUSP",
  "ACID_TRAB",
  "OUTRO"
] as const;

export type OccurrenceFrequencyCode = (typeof occurrenceFrequencyCodes)[number];

const typePermissionMap: Partial<Record<OccurrenceFrequencyCode, { view: HrPermission; register: HrPermission }>> = {
  ADVERT: { view: HrPermission.WARNING_VIEW, register: HrPermission.WARNING_REGISTER },
  SUSP: { view: HrPermission.SUSPENSION_VIEW, register: HrPermission.SUSPENSION_REGISTER },
  ACID_TRAB: { view: HrPermission.WORK_ACCIDENT_VIEW, register: HrPermission.WORK_ACCIDENT_REGISTER }
};

export function occurrenceTypePermission(code: string) {
  return typePermissionMap[code.toUpperCase() as OccurrenceFrequencyCode] ?? null;
}

export function legacyOccurrenceType(code: string): EmployeeOccurrenceType {
  switch (code.toUpperCase()) {
    case "ATEST": return EmployeeOccurrenceType.ATESTADO_MEDICO;
    case "FALTA_INJ":
    case "FALTA_JUST": return EmployeeOccurrenceType.FALTA;
    case "FERIAS": return EmployeeOccurrenceType.FERIAS;
    case "AUX_DOENCA": return EmployeeOccurrenceType.AFASTAMENTO;
    case "ADVERT": return EmployeeOccurrenceType.ADVERTENCIA;
    case "SUSP": return EmployeeOccurrenceType.SUSPENSAO;
    case "ACID_TRAB": return EmployeeOccurrenceType.ACIDENTE_TRABALHO;
    default: return EmployeeOccurrenceType.OUTRO;
  }
}

export function occurrenceImpactRange(input: {
  code: string;
  startDate: Date;
  endDate?: Date | null;
  hasAccidentLeave?: boolean | null;
  accidentLeaveStartDate?: Date | null;
  accidentLeaveEndDate?: Date | null;
}) {
  const code = input.code.toUpperCase();
  if (code === "SUSP") return { start: input.startDate, end: input.endDate ?? input.startDate };
  if (code === "ACID_TRAB" && input.hasAccidentLeave && input.accidentLeaveStartDate) {
    return { start: input.accidentLeaveStartDate, end: input.accidentLeaveEndDate ?? input.accidentLeaveStartDate };
  }
  return null;
}

export function validateOccurrenceBusinessRules(input: {
  code: string;
  startDate: Date;
  endDate?: Date | null;
  reasonId?: string | null;
  accidentOccurredAt?: Date | null;
  accidentLocation?: string | null;
  hasAccidentLeave?: boolean | null;
  accidentLeaveStartDate?: Date | null;
  accidentLeaveEndDate?: Date | null;
}) {
  const errors: string[] = [];
  if (input.endDate && input.endDate < input.startDate) errors.push("A data final deve ser igual ou posterior a data inicial");
  if (["ADVERT", "SUSP"].includes(input.code) && !input.reasonId) errors.push("O motivo padronizado e obrigatorio");
  if (input.code === "ACID_TRAB") {
    if (!input.accidentOccurredAt) errors.push("A data e hora do acidente sao obrigatorias");
    if (!input.accidentLocation?.trim()) errors.push("O local do acidente e obrigatorio");
    if (input.hasAccidentLeave && !input.accidentLeaveStartDate) errors.push("A data inicial do afastamento e obrigatoria");
    if (input.accidentLeaveStartDate && input.accidentLeaveEndDate && input.accidentLeaveEndDate < input.accidentLeaveStartDate) {
      errors.push("A data final do afastamento deve ser igual ou posterior a inicial");
    }
  }
  return errors;
}

export function calendarDayCount(start: Date, end?: Date | null): number {
  const finish = end ?? start;
  return Math.max(1, Math.round((Date.UTC(finish.getUTCFullYear(), finish.getUTCMonth(), finish.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86_400_000) + 1);
}
