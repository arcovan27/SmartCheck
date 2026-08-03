import { EmployeeOccurrenceType, OccurrenceStatus, Prisma } from "@prisma/client";

export const operationalDepartmentWhere: Prisma.DepartmentWhereInput = {
  deletedAt: null,
  isActive: true
};

export const visibleDepartmentWhere: Prisma.DepartmentWhereInput = {
  deletedAt: null
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function zonedStartOfDay(value: string, timeZone: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error("Data invalida");
  const [year, month, day] = value.split("-").map(Number);
  const approximate = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(approximate)).map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(approximate - (representedAsUtc - approximate));
}

export function inclusiveDateRange(startDate: string, endDate: string, timeZone = "America/Sao_Paulo") {
  const start = zonedStartOfDay(startDate, timeZone);
  const endExclusive = zonedStartOfDay(addCalendarDays(endDate, 1), timeZone);
  if (endExclusive <= start) throw new Error("Periodo invalido");
  if (endExclusive.getTime() - start.getTime() > (2 * 366 + 1) * 86_400_000) throw new Error("O periodo aceita no maximo dois anos");
  return { start, endExclusive, endInclusive: new Date(endExclusive.getTime() - 1), startDate, endDate, timeZone };
}

export function inclusiveStoredCivilDateRange(startDate: string, endDate: string, timeZone = "America/Sao_Paulo") {
  inclusiveDateRange(startDate, endDate, timeZone);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${addCalendarDays(endDate, 1)}T00:00:00.000Z`);
  return { start, endExclusive, endInclusive: new Date(endExclusive.getTime() - 1), startDate, endDate, timeZone };
}

export function occurrenceCountsInIndicators(status: OccurrenceStatus, deletedAt?: Date | null): boolean {
  return !deletedAt && status !== OccurrenceStatus.REJEITADO && status !== OccurrenceStatus.CANCELADO;
}

export type OccurrenceIndicatorBucket = "JUSTIFIED_ABSENCE" | "UNJUSTIFIED_ABSENCE" | "MEDICAL_CERTIFICATE" | "LEAVE" | "VACATION" | "WARNING" | "SUSPENSION" | "WORK_ACCIDENT" | "LICENSE" | "OTHER";

export function occurrenceIndicatorBucket(input: { type: EmployeeOccurrenceType; isJustified?: boolean | null; frequencyCode?: string | null }): OccurrenceIndicatorBucket {
  const code = input.frequencyCode?.toUpperCase();
  if (code === "ATEST") return "MEDICAL_CERTIFICATE";
  if (code === "FALTA_INJ") return "UNJUSTIFIED_ABSENCE";
  if (code === "FALTA_JUST") return "JUSTIFIED_ABSENCE";
  if (code === "ADVERT") return "WARNING";
  if (code === "SUSP") return "SUSPENSION";
  if (code === "ACID_TRAB") return "WORK_ACCIDENT";
  if (code === "FERIAS") return "VACATION";
  if (code?.startsWith("LIC_") || ["ACOMP_FAMILIAR", "DOENCA_FILHO", "INTERN_FILHO", "INTERN_CONJUGE", "JUST_ELEITORAL"].includes(code ?? "")) return "LICENSE";
  if (["AUX_DOENCA", "SERV_MILITAR", "AFAST_JUDICIAL"].includes(code ?? "")) return "LEAVE";
  if (input.type === EmployeeOccurrenceType.ATESTADO_MEDICO) return "MEDICAL_CERTIFICATE";
  if (input.type === EmployeeOccurrenceType.FERIAS) return "VACATION";
  if (input.type === EmployeeOccurrenceType.AFASTAMENTO) return "LEAVE";
  if (input.type === EmployeeOccurrenceType.ADVERTENCIA) return "WARNING";
  if (input.type === EmployeeOccurrenceType.FALTA) return input.isJustified ? "JUSTIFIED_ABSENCE" : "UNJUSTIFIED_ABSENCE";
  return "OTHER";
}

export type DepartmentDeletionImpact = {
  activeEmployees: number;
  activeTeams: number;
  activeAssignments: number;
  futureSchedules: number;
};

export function departmentDeletionBlockers(impact: DepartmentDeletionImpact, transferEmployees: boolean): string[] {
  const blockers: string[] = [];
  if (impact.activeEmployees > 0 && !transferEmployees) blockers.push("activeEmployees");
  if (impact.activeTeams > 0) blockers.push("activeTeams");
  if (impact.activeAssignments > 0) blockers.push("activeAssignments");
  if (impact.futureSchedules > 0) blockers.push("futureSchedules");
  return blockers;
}
