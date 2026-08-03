import { createHash } from "node:crypto";
import { OccurrenceStatus, ScheduleDayType, ScheduleImportItemStatus, SchedulePeriodStatus } from "@prisma/client";
import { buildScheduleInterval } from "./schedules.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PatternDayDefinition = {
  cyclePosition: number;
  dayType: ScheduleDayType;
  shiftId?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  breakMinutes?: number;
  crossesMidnight?: boolean;
};

export type MaterializedPatternDay = PatternDayDefinition & {
  date: string;
  plannedMinutes: number;
};

export type ImportAdDecision =
  | { mode: "AUX_DOENCA" | "ADVERT" | "FALTA_JUST" | "IGNORE" }
  | { mode: "INDIVIDUAL"; values: Record<string, "AUX_DOENCA" | "ADVERT" | "FALTA_JUST" | "IGNORE"> };

const sourceCodeMap: Record<string, string> = {
  T: "TRAB",
  DSR: "DSR",
  AT: "ATEST",
  IN: "FALTA_INJ",
  FE: "FERIAS",
  FD: "FERIADO",
  EM: "EMENDA",
  SU: "SUSP",
  LP: "LIC_PAT",
  AE: "ACOMP_FAMILIAR",
  AC: "ACID_TRAB",
  LC: "LIC_CAS",
  LF: "LIC_OBITO",
  DF: "DOENCA_FILHO",
  IF: "INTERN_FILHO",
  IE: "INTERN_CONJUGE",
  SM: "SERV_MILITAR",
  JE: "JUST_ELEITORAL",
  AJ: "AFAST_JUDICIAL"
};

export function dateOnly(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error("Data invalida");
  const date = new Date(`${value}T12:00:00-03:00`);
  if (!Number.isFinite(date.getTime()) || dateKey(date) !== value) throw new Error("Data invalida");
  return date;
}

export function dateKey(value: Date): string {
  return value.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function startOfCompetence(value: string | Date): Date {
  const key = typeof value === "string" ? value : dateKey(value);
  if (!/^\d{4}-\d{2}/.test(key)) throw new Error("Competencia invalida");
  return dateOnly(`${key.slice(0, 7)}-01`);
}

export function endOfCompetence(value: string | Date): Date {
  const start = startOfCompetence(value);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

export function plannedMinutes(startMinute?: number | null, endMinute?: number | null, breakMinutes = 0, crossesMidnight = false): number {
  if (startMinute === null || startMinute === undefined || endMinute === null || endMinute === undefined) return 0;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || startMinute > 1439 || endMinute < 0 || endMinute > 1439) {
    throw new Error("Horario do padrao invalido");
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) throw new Error("Intervalo do padrao invalido");
  if (endMinute <= startMinute && !crossesMidnight) throw new Error("Jornada noturna deve indicar virada de dia");
  if (endMinute > startMinute && crossesMidnight) throw new Error("Virada de dia incompatível com os horarios informados");
  let duration = endMinute - startMinute;
  if (crossesMidnight) duration += 1440;
  if (duration <= breakMinutes) throw new Error("Intervalo nao pode consumir toda a jornada");
  return duration - breakMinutes;
}

export function minuteToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 1439) throw new Error("Horario invalido");
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function intervalForPatternDay(date: string, day: PatternDayDefinition) {
  if (day.dayType !== ScheduleDayType.WORK) {
    const at = new Date(`${date}T12:00:00-03:00`);
    return { startAt: at, endAt: new Date(at), plannedMinutes: 0 };
  }
  if (day.startMinute === null || day.startMinute === undefined || day.endMinute === null || day.endMinute === undefined) {
    throw new Error("Dia de trabalho sem horario definido");
  }
  const interval = buildScheduleInterval(date, minuteToTime(day.startMinute), minuteToTime(day.endMinute));
  return { ...interval, plannedMinutes: plannedMinutes(day.startMinute, day.endMinute, day.breakMinutes, day.crossesMidnight) };
}

export function materializePattern(input: {
  from: string;
  until: string;
  cycleDays: number;
  cycleOffset?: number;
  days: PatternDayDefinition[];
}): MaterializedPatternDay[] {
  const start = dateOnly(input.from);
  const end = dateOnly(input.until);
  if (end < start) throw new Error("Periodo da escala invalido");
  if (!Number.isInteger(input.cycleDays) || input.cycleDays < 1 || input.cycleDays > 366) throw new Error("Quantidade de dias do ciclo invalida");
  const positions = new Set(input.days.map((day) => day.cyclePosition));
  if (positions.size !== input.days.length || input.days.some((day) => day.cyclePosition < 1 || day.cyclePosition > input.cycleDays)) {
    throw new Error("Posicoes do ciclo invalidas ou duplicadas");
  }
  const byPosition = new Map(input.days.map((day) => [day.cyclePosition, day]));
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (span > 366) throw new Error("A aplicacao nao pode ultrapassar 366 dias");
  const offset = ((input.cycleOffset ?? 0) % input.cycleDays + input.cycleDays) % input.cycleDays;
  const result: MaterializedPatternDay[] = [];
  for (let index = 0; index <= span; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const cyclePosition = ((index + offset) % input.cycleDays) + 1;
    const definition = byPosition.get(cyclePosition);
    if (!definition) continue;
    result.push({ ...definition, date: dateKey(date), plannedMinutes: definition.dayType === ScheduleDayType.WORK ? plannedMinutes(definition.startMinute, definition.endMinute, definition.breakMinutes, definition.crossesMidnight) : 0 });
  }
  return result;
}

export function assertEmployeePeriod(input: { admissionDate?: Date | null; dismissalDate?: Date | null; isActive: boolean }, date: Date) {
  if (!input.isActive) throw new Error("Funcionario inativo");
  const key = dateKey(date);
  if (input.admissionDate && key < dateKey(input.admissionDate)) throw new Error("Escala anterior a admissao");
  if (input.dismissalDate && key > dateKey(input.dismissalDate)) throw new Error("Escala posterior ao desligamento");
}

export function assertPeriodEditable(status?: SchedulePeriodStatus | null, canReopen = false) {
  if (status === SchedulePeriodStatus.CLOSED && !canReopen) throw new Error("Competencia fechada para alteracoes");
}

export function resolveImportCode(sourceCode: string, sourceKey: string, decision?: ImportAdDecision): { status: ScheduleImportItemStatus; internalCode?: string } {
  const normalized = sourceCode.trim().toUpperCase();
  if (normalized === "AD") {
    if (!decision) return { status: ScheduleImportItemStatus.CODE_AMBIGUOUS };
    const selected = decision.mode === "INDIVIDUAL" ? decision.values[sourceKey] : decision.mode;
    if (!selected) return { status: ScheduleImportItemStatus.CODE_AMBIGUOUS };
    if (selected === "IGNORE") return { status: ScheduleImportItemStatus.IGNORED };
    return { status: ScheduleImportItemStatus.READY, internalCode: selected };
  }
  const internalCode = sourceCodeMap[normalized];
  return internalCode ? { status: ScheduleImportItemStatus.READY, internalCode } : { status: ScheduleImportItemStatus.CODE_NOT_FOUND };
}

export function normalizePersonName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function canonicalImportHash(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalize(nested)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function attendanceDefaultStatus(input: { requiresApproval: boolean; requiresDocument: boolean }): OccurrenceStatus {
  return input.requiresApproval || input.requiresDocument ? OccurrenceStatus.PENDENTE : OccurrenceStatus.APROVADO;
}

export function monthlyAttendanceSummary(rows: Array<{ plannedMinutes?: number | null; frequency?: { code: string; countsAsPresence: boolean; countsAsAbsence: boolean }; status?: OccurrenceStatus }>) {
  const byCode: Record<string, number> = {};
  let plannedMinutesTotal = 0;
  let presenceDays = 0;
  let absenceDays = 0;
  let pendingDays = 0;
  for (const row of rows) {
    plannedMinutesTotal += row.plannedMinutes ?? 0;
    if (!row.frequency) continue;
    byCode[row.frequency.code] = (byCode[row.frequency.code] ?? 0) + 1;
    if (row.frequency.countsAsPresence) presenceDays += 1;
    if (row.frequency.countsAsAbsence) absenceDays += 1;
    if (row.status === OccurrenceStatus.PENDENTE || row.status === OccurrenceStatus.EM_ANALISE) pendingDays += 1;
  }
  return { byCode, plannedMinutes: plannedMinutesTotal, presenceDays, absenceDays, pendingDays };
}
