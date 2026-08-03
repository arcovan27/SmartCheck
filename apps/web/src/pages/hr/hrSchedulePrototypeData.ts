export type PrototypeShift = {
  id: string;
  code: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: number;
  color: string;
  crossesMidnight?: boolean;
  active: boolean;
};

export type PrototypePattern = {
  id: string;
  code: string;
  name: string;
  description: string;
  cycle: string[];
  shiftId?: string;
  people: number;
  active: boolean;
};

export type PrototypeEmployee = {
  id: string;
  registration: string;
  name: string;
  department: string;
  position: string;
  team: string;
  unit: string;
  shiftId?: string;
};

export type PrototypeFrequency = {
  id: string;
  code: string;
  shortCode: string;
  name: string;
  category: string;
  color: string;
  requiresDocument?: boolean;
  requiresApproval?: boolean;
};

export type PrototypeDayCell = {
  planned?: {
    kind: "WORK" | "DSR" | "DAY_OFF" | "HOLIDAY";
    label: string;
    shiftId?: string;
  };
  actual?: {
    frequencyId: string;
    status?: "PENDENTE" | "APROVADO";
  };
  note?: string;
  conflict?: boolean;
};

export const prototypeShifts: PrototypeShift[] = [
  { id: "shift-adm", code: "ADM", name: "Administrativo", start: "08:00", end: "17:00", breakMinutes: 60, color: "#0f766e", active: true },
  { id: "shift-a", code: "T-A", name: "Turno A", start: "06:00", end: "18:00", breakMinutes: 60, color: "#2563eb", active: true },
  { id: "shift-b", code: "T-B", name: "Turno B", start: "18:00", end: "06:00", breakMinutes: 60, color: "#7c3aed", crossesMidnight: true, active: true },
  { id: "shift-com", code: "COM", name: "Comercial", start: "09:00", end: "18:00", breakMinutes: 60, color: "#d97706", active: false }
];

export const prototypePatterns: PrototypePattern[] = [
  { id: "pattern-5x2", code: "5X2", name: "Segunda a sexta", description: "Cinco dias de trabalho e dois dias de descanso.", cycle: ["T", "T", "T", "T", "T", "DSR", "DSR"], shiftId: "shift-adm", people: 18, active: true },
  { id: "pattern-6x1", code: "6X1", name: "Operacional 6x1", description: "Seis dias trabalhados e uma folga no ciclo.", cycle: ["T", "T", "T", "T", "T", "T", "F"], shiftId: "shift-a", people: 27, active: true },
  { id: "pattern-12x36", code: "12X36", name: "Revezamento 12x36", description: "Doze horas de trabalho seguidas por trinta e seis horas de descanso.", cycle: ["T", "F"], shiftId: "shift-b", people: 16, active: true },
  { id: "pattern-flex", code: "FLEX", name: "Ciclo personalizado", description: "Ciclo configurável para coberturas e exceções operacionais.", cycle: ["T", "T", "F", "T", "DSR"], people: 0, active: false }
];

export const prototypeEmployees: PrototypeEmployee[] = [
  { id: "emp-1", registration: "F-0101", name: "Ana Martins", department: "Administrativo", position: "Analista", team: "Apoio", unit: "Matriz", shiftId: "shift-adm" },
  { id: "emp-2", registration: "F-0108", name: "Bruno Almeida", department: "Produção", position: "Operador", team: "Equipe Alfa", unit: "Matriz", shiftId: "shift-a" },
  { id: "emp-3", registration: "F-0116", name: "Carla Nogueira", department: "Produção", position: "Operadora", team: "Equipe Alfa", unit: "Matriz", shiftId: "shift-a" },
  { id: "emp-4", registration: "F-0124", name: "Diego Santos", department: "Expedição", position: "Conferente", team: "Equipe Beta", unit: "Matriz", shiftId: "shift-b" },
  { id: "emp-5", registration: "F-0131", name: "Elisa Ribeiro", department: "Qualidade", position: "Inspetora", team: "Qualidade", unit: "Matriz", shiftId: "shift-adm" },
  { id: "emp-6", registration: "F-0143", name: "Felipe Costa", department: "Manutenção", position: "Técnico", team: "Equipe Beta", unit: "Matriz", shiftId: "shift-b" },
  { id: "emp-7", registration: "F-0152", name: "Gabriela Lima", department: "Produção", position: "Líder", team: "Equipe Alfa", unit: "Matriz", shiftId: "shift-a" },
  { id: "emp-8", registration: "F-0160", name: "Henrique Melo", department: "Logística", position: "Auxiliar", team: "Equipe Beta", unit: "Matriz" }
];

export const prototypeFrequencies: PrototypeFrequency[] = [
  { id: "freq-worked", code: "TRAB", shortCode: "T", name: "Trabalhou", category: "Presença", color: "#047857" },
  { id: "freq-dsr", code: "DSR", shortCode: "DSR", name: "Descanso semanal remunerado", category: "Descanso", color: "#475569" },
  { id: "freq-certificate", code: "ATEST", shortCode: "AT", name: "Atestado", category: "Ausência justificada", color: "#0284c7", requiresDocument: true, requiresApproval: true },
  { id: "freq-unjustified", code: "FALTA_INJ", shortCode: "IN", name: "Falta injustificada", category: "Ausência injustificada", color: "#dc2626" },
  { id: "freq-vacation", code: "FERIAS", shortCode: "FE", name: "Férias", category: "Afastamento", color: "#7c3aed", requiresApproval: true },
  { id: "freq-suspension", code: "SUSP", shortCode: "SU", name: "Suspensão", category: "Ocorrência disciplinar", color: "#c2410c", requiresApproval: true }
];

export const prototypeHolidays = new Map<number, string>([[9, "Feriado municipal"]]);

export function buildPrototypeCells(): Record<string, PrototypeDayCell> {
  const cells: Record<string, PrototypeDayCell> = {};

  for (const [employeeIndex, employee] of prototypeEmployees.entries()) {
    for (let day = 1; day <= 31; day += 1) {
      const weekday = new Date(2026, 6, day).getDay();
      const holiday = prototypeHolidays.get(day);
      const isAdministrative = employee.shiftId === "shift-adm";
      const worksAlternating = employee.shiftId === "shift-b";
      const works = holiday ? false : worksAlternating ? (day + employeeIndex) % 2 === 0 : isAdministrative ? weekday >= 1 && weekday <= 5 : weekday !== 0;
      const planned = holiday
        ? { kind: "HOLIDAY" as const, label: "FD" }
        : works
          ? { kind: "WORK" as const, label: prototypeShifts.find((shift) => shift.id === employee.shiftId)?.code ?? "AV", shiftId: employee.shiftId }
          : { kind: weekday === 0 ? "DSR" as const : "DAY_OFF" as const, label: weekday === 0 ? "DSR" : "F" };
      const cell: PrototypeDayCell = { planned };
      if (day <= 29) cell.actual = { frequencyId: works ? "freq-worked" : "freq-dsr", status: "APROVADO" };
      cells[`${employee.id}-${day}`] = cell;
    }
  }

  cells["emp-1-3"] = { ...cells["emp-1-3"], actual: { frequencyId: "freq-certificate", status: "APROVADO" }, note: "Documento validado" };
  cells["emp-2-10"] = { ...cells["emp-2-10"], actual: { frequencyId: "freq-unjustified", status: "APROVADO" }, note: "Aguardando tratativa do gestor" };
  cells["emp-3-20"] = { ...cells["emp-3-20"], actual: { frequencyId: "freq-vacation", status: "APROVADO" } };
  cells["emp-4-14"] = { ...cells["emp-4-14"], conflict: true, note: "Sobreposição com cobertura temporária" };
  cells["emp-5-24"] = { ...cells["emp-5-24"], actual: { frequencyId: "freq-certificate", status: "PENDENTE" }, note: "Documento em análise" };
  cells["emp-6-18"] = { ...cells["emp-6-18"], actual: { frequencyId: "freq-suspension", status: "APROVADO" } };
  for (let day = 1; day <= 31; day += 1) delete cells[`emp-8-${day}`].planned;

  return cells;
}
