import http from "node:http";

const company = { id: "company-demo", legalName: "SmartCheck Demonstração", tradeName: "Unidade Industrial" };
const shifts = [
  { id: "shift-adm", companyId: company.id, name: "Administrativo", code: "ADM", startMinute: 480, endMinute: 1020, breakMinutes: 60, plannedMinutes: 480, crossesMidnight: false, color: "#0f766e", isActive: true },
  { id: "shift-night", companyId: company.id, name: "Noturno", code: "NOT", startMinute: 1080, endMinute: 360, breakMinutes: 60, plannedMinutes: 660, crossesMidnight: true, color: "#7c3aed", isActive: true }
];
const frequencies = [
  { id: "frequency-work", companyId: company.id, code: "TRAB", shortCode: "T", name: "Trabalhou", category: "PRESENCE", color: "#047857", countsAsPresence: true, countsAsAbsence: false, requiresDocument: false, requiresApproval: false, isActive: true },
  { id: "frequency-certificate", companyId: company.id, code: "ATEST", shortCode: "AT", name: "Atestado", category: "JUSTIFIED_ABSENCE", color: "#0284c7", countsAsPresence: false, countsAsAbsence: true, requiresDocument: true, requiresApproval: true, isActive: true },
  { id: "frequency-absence", companyId: company.id, code: "FALTA_INJ", shortCode: "IN", name: "Falta injustificada", category: "UNJUSTIFIED_ABSENCE", color: "#dc2626", countsAsPresence: false, countsAsAbsence: true, requiresDocument: false, requiresApproval: true, isActive: true }
];
const employees = [
  { id: "employee-1", companyId: company.id, unitId: "unit-1", departmentId: "department-1", teamId: "team-1", name: "Ana Martins", registration: "F-0101", isActive: true },
  { id: "employee-2", companyId: company.id, unitId: "unit-1", departmentId: "department-1", teamId: "team-1", name: "Bruno Almeida", registration: "F-0108", isActive: true },
  { id: "employee-3", companyId: company.id, unitId: "unit-1", departmentId: "department-2", teamId: "team-2", name: "Carla Nogueira", registration: "F-0116", isActive: true }
];
const reference = { companies: [company], units: [{ id: "unit-1", companyId: company.id, name: "Matriz" }], departments: [{ id: "department-1", companyId: company.id, name: "Produção" }, { id: "department-2", companyId: company.id, name: "Qualidade" }], positions: [], costCenters: [], teams: [{ id: "team-1", companyId: company.id, name: "Equipe Alfa" }, { id: "team-2", companyId: company.id, name: "Equipe Beta" }], employees, shifts, patterns: [{ id: "pattern-1", companyId: company.id, name: "Operacional 5x2", code: "5X2", patternType: "WEEKLY", cycleDays: 7, isActive: true, days: Array.from({ length: 7 }, (_, index) => ({ id: `pattern-day-${index}`, cyclePosition: index + 1, dayType: index < 5 ? "WORK" : index === 6 ? "DSR" : "DAY_OFF", shiftId: index < 5 ? "shift-adm" : null, startMinute: index < 5 ? 480 : null, endMinute: index < 5 ? 1020 : null, breakMinutes: index < 5 ? 60 : 0, crossesMidnight: false })) }], frequencyTypes: frequencies, holidays: [{ id: "holiday-1", date: "2026-07-09T00:00:00.000Z", name: "Feriado municipal" }], periods: [{ id: "period-1", unitId: "unit-1", status: "OPEN" }] };

function grid(url) {
  const competence = url.searchParams.get("competence") || "2026-07";
  const rows = employees.map((employee, employeeIndex) => {
    const cells = {};
    for (let day = 1; day <= 31; day += 1) {
      const date = `${competence}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00:00-03:00`).getDay();
      const works = weekday > 0 && weekday < 6;
      cells[date] = { schedule: { id: `schedule-${employee.id}-${day}`, scheduleDate: date, dayType: works ? "WORK" : weekday === 0 ? "DSR" : "DAY_OFF", startAt: `${date}T11:00:00.000Z`, endAt: `${date}T20:00:00.000Z`, plannedMinutes: works ? 480 : 0, shift: works ? shifts[employeeIndex === 2 ? 1 : 0] : null } };
      if (day < 29 && works) cells[date].attendance = { id: `attendance-${employee.id}-${day}`, date, status: "APROVADO", frequencyType: frequencies[0] };
    }
    if (employeeIndex === 1) cells[`${competence}-10`].attendance = { id: "attendance-absence", date: `${competence}-10`, status: "APROVADO", frequencyType: frequencies[2] };
    if (employeeIndex === 2) cells[`${competence}-24`].attendance = { id: "attendance-certificate", date: `${competence}-24`, status: "PENDENTE", frequencyType: frequencies[1] };
    return { employee: { ...employee, department: employeeIndex === 2 ? "Qualidade" : "Produção", position: "Operador", departmentRef: { id: employee.departmentId, name: employeeIndex === 2 ? "Qualidade" : "Produção" }, team: { id: employee.teamId, name: employeeIndex === 2 ? "Equipe Beta" : "Equipe Alfa" } }, cells, summary: { byCode: { TRAB: 19 }, plannedMinutes: 10560, presenceDays: 19, absenceDays: employeeIndex ? 1 : 0, pendingDays: employeeIndex === 2 ? 1 : 0 } };
  });
  return { competence, rows, total: rows.length, page: 1, pageSize: 50, holidays: reference.holidays, periods: reference.periods };
}

http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4178"); response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type"); response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS"); response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
  const url = new URL(request.url || "/", "http://127.0.0.1:3333");
  if (url.pathname === "/auth/login") return response.end(JSON.stringify({ token: "local-visual-test", user: { id: "user-demo", email: "admin@smartcheck.local", role: "ADMIN", isActive: true, permissions: ["HR_ACCESS", "SCHEDULE_VIEW", "SCHEDULE_MANAGE", "SCHEDULE_CREATE", "SCHEDULE_EDIT", "SCHEDULE_BULK_EDIT", "FREQUENCY_REGISTER", "OCCURRENCE_REGISTER", "CERTIFICATE_APPROVE", "SCHEDULE_IMPORT", "SCHEDULE_EXPORT", "SCHEDULE_PERIOD_CLOSE", "SCHEDULE_PERIOD_REOPEN", "SHIFT_MANAGE", "FREQUENCY_TYPE_MANAGE", "CATALOG_MANAGE", "HR_DASHBOARD_VIEW", "EPI_VIEW", "EMPLOYEE_VIEW"] } }));
  if (url.pathname === "/auth/me") return response.end(JSON.stringify({ id: "user-demo", email: "admin@smartcheck.local", role: "ADMIN", isActive: true, permissions: ["HR_ACCESS", "SCHEDULE_VIEW", "SCHEDULE_MANAGE", "SCHEDULE_CREATE", "SCHEDULE_EDIT", "SCHEDULE_BULK_EDIT", "FREQUENCY_REGISTER", "OCCURRENCE_REGISTER", "CERTIFICATE_APPROVE", "SCHEDULE_IMPORT", "SCHEDULE_EXPORT", "SCHEDULE_PERIOD_CLOSE", "SCHEDULE_PERIOD_REOPEN", "SHIFT_MANAGE", "FREQUENCY_TYPE_MANAGE", "CATALOG_MANAGE", "HR_DASHBOARD_VIEW", "EPI_VIEW", "EMPLOYEE_VIEW"] }));
  if (url.pathname === "/company") return response.end(JSON.stringify(company));
  if (url.pathname === "/hr/workforce/reference-data") return response.end(JSON.stringify(reference));
  if (url.pathname === "/hr/workforce/grid") return response.end(JSON.stringify(grid(url)));
  if (url.pathname === "/hr/workforce/export") { response.setHeader("Content-Type", "text/csv; charset=utf-8"); response.setHeader("Content-Disposition", "attachment; filename=escala-demo.csv"); return response.end("Matrícula;Funcionário\r\nF-0101;Ana Martins"); }
  if (request.method !== "GET") { response.writeHead(201); return response.end(JSON.stringify({ id: "created-demo", previewHash: "a".repeat(64), recordCount: 93, conflicts: [] })); }
  response.writeHead(404); response.end(JSON.stringify({ message: "Rota simulada não encontrada" }));
}).listen(3333, "127.0.0.1");
