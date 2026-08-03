import type { FastifyInstance, FastifyRequest } from "fastify";
import { HrPermission, Prisma, ScheduleAssignmentStatus, ScheduleOrigin, SchedulePeriodStatus, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, requireAnyHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";
import { intervalsOverlap } from "../services/schedules.js";
import { assertEmployeePeriod, canonicalImportHash, dateKey, dateOnly, endOfCompetence, intervalForPatternDay, materializePattern, monthlyAttendanceSummary, startOfCompetence } from "../services/workforceSchedules.js";
import { requireWorkScheduleEnabled } from "../services/hrFeatureGuards.js";

const assignmentInput = z.object({
  companyId: z.string(),
  employeeIds: z.array(z.string().cuid()).min(1).max(500),
  patternId: z.string().cuid(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycleOffset: z.number().int().min(0).max(365).default(0),
  unitId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  teamId: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  allowConflicts: z.boolean().default(false)
});

type AssignmentBody = z.infer<typeof assignmentInput>;

async function buildAssignmentPreview(request: FastifyRequest, body: AssignmentBody) {
  const scope = await resolveHrDataScope(request);
  assertCompanyAccess(scope, body.companyId);
  assertUnitAccess(scope, body.unitId);
  await assertOrganizationReferences(body.companyId, body);
  const from = dateOnly(body.validFrom);
  const until = dateOnly(body.validUntil);
  if (until < from) throw new Error("Periodo da atribuicao invalido");
  const periodUnitFilter = body.unitId ? { OR: [{ unitId: null }, { unitId: body.unitId }] } : scope.allUnitsInCompanies ? {} : { OR: [{ unitId: null }, { unitId: { in: scope.unitIds } }] };

  const [pattern, employees, periods] = await Promise.all([
    prisma.schedulePattern.findFirst({ where: { id: body.patternId, companyId: body.companyId, isActive: true }, include: { days: { orderBy: { cyclePosition: "asc" }, include: { shift: true } } } }),
    prisma.employee.findMany({ where: { id: { in: body.employeeIds }, companyId: body.companyId, unitId: unitScopeFilter(scope, body.unitId ?? undefined) }, select: { id: true, name: true, registration: true, companyId: true, unitId: true, departmentId: true, teamId: true, admissionDate: true, dismissalDate: true, isActive: true } }),
    prisma.schedulePeriod.findMany({ where: { companyId: body.companyId, competence: { gte: startOfCompetence(from), lte: startOfCompetence(until) }, ...periodUnitFilter } })
  ]);
  if (!pattern) throw new Error("Padrao de escala nao encontrado ou inativo");
  if (employees.length !== new Set(body.employeeIds).size) throw new Error("Funcionario inexistente ou de outra empresa");
  if (periods.some((period) => period.status === SchedulePeriodStatus.CLOSED)) throw new Error("O periodo inclui competencia fechada");

  const days = materializePattern({ from: body.validFrom, until: body.validUntil, cycleDays: pattern.cycleDays, cycleOffset: body.cycleOffset, days: pattern.days });
  if (!days.length) throw new Error("O padrao nao gera nenhum dia no periodo informado");
  if (days.length * employees.length > 15_500) throw new Error("A aplicacao excede o limite de 15.500 dias; divida o periodo");
  const intervals = days.map((day) => ({ ...day, ...intervalForPatternDay(day.date, day) }));
  const existing = await prisma.workSchedule.findMany({
    where: { companyId: body.companyId, employeeId: { in: body.employeeIds }, status: WorkScheduleStatus.ATIVA, startAt: { lt: new Date(Math.max(...intervals.map((item) => item.endAt.getTime())) + 1) }, endAt: { gt: new Date(Math.min(...intervals.map((item) => item.startAt.getTime())) - 1) } },
    select: { id: true, employeeId: true, startAt: true, endAt: true }
  });
  const conflicts: Array<{ employeeId: string; employeeName: string; date: string; reason: string; scheduleId?: string }> = [];
  for (const employee of employees) {
    for (const day of intervals) {
      try { assertEmployeePeriod(employee, dateOnly(day.date)); } catch (error) { conflicts.push({ employeeId: employee.id, employeeName: employee.name, date: day.date, reason: error instanceof Error ? error.message : "Vinculo invalido" }); continue; }
      if (day.plannedMinutes === 0) continue;
      const overlap = existing.find((item) => item.employeeId === employee.id && intervalsOverlap(day.startAt, day.endAt, item.startAt, item.endAt));
      if (overlap) conflicts.push({ employeeId: employee.id, employeeName: employee.name, date: day.date, reason: "Escala sobreposta", scheduleId: overlap.id });
    }
  }
  const { allowConflicts: _allowConflicts, previewHash: _previewHash, ...hashBody } = body as AssignmentBody & { previewHash?: string };
  const snapshot = {
    input: { ...hashBody, employeeIds: [...body.employeeIds].sort() },
    pattern: { id: pattern.id, updatedAt: pattern.updatedAt, days: pattern.days.map((day) => ({ id: day.id, cyclePosition: day.cyclePosition, dayType: day.dayType, shiftId: day.shiftId, startMinute: day.startMinute, endMinute: day.endMinute, breakMinutes: day.breakMinutes, plannedMinutes: day.plannedMinutes, crossesMidnight: day.crossesMidnight })) },
    employees: employees.map((employee) => ({ id: employee.id, unitId: employee.unitId, departmentId: employee.departmentId, teamId: employee.teamId, isActive: employee.isActive, admissionDate: employee.admissionDate, dismissalDate: employee.dismissalDate })).sort((a, b) => a.id.localeCompare(b.id)),
    conflicts
  };
  return { pattern, employees, days: intervals, conflicts, previewHash: canonicalImportHash(snapshot), recordCount: days.length * employees.length };
}

export async function hrWorkforcePlanningRoutes(app: FastifyInstance) {
  app.get("/hr/workforce/grid", { preHandler: [app.authenticate, requireHrPermission(HrPermission.SCHEDULE_VIEW)] }, async (request) => {
    const query = z.object({
      competence: z.string().regex(/^\d{4}-\d{2}$/), companyId: z.string().optional(), unitId: z.string().optional(), departmentId: z.string().optional(), teamId: z.string().optional(), shiftId: z.string().optional(), employeeId: z.string().cuid().optional(), isActive: z.coerce.boolean().default(true), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50)
    }).parse(request.query);
    const scope = await resolveHrDataScope(request);
    if (query.companyId) assertCompanyAccess(scope, query.companyId);
    assertUnitAccess(scope, query.unitId);
    const companyIds = query.companyId ? [query.companyId] : scope.companyIds;
    const from = startOfCompetence(`${query.competence}-01`);
    const until = endOfCompetence(from);
    const employeeWhere: Prisma.EmployeeWhereInput = { companyId: { in: companyIds }, unitId: unitScopeFilter(scope, query.unitId), departmentId: query.departmentId, teamId: query.teamId, id: query.employeeId, isActive: query.isActive };
    const [employees, total, holidays, periods] = await prisma.$transaction([
      prisma.employee.findMany({ where: employeeWhere, select: { id: true, name: true, registration: true, companyId: true, unitId: true, department: true, position: true, departmentRef: { select: { id: true, name: true } }, team: { select: { id: true, name: true } } }, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.employee.count({ where: employeeWhere }),
      prisma.holiday.findMany({ where: { companyId: { in: companyIds }, date: { gte: from, lte: until }, isActive: true, ...(query.unitId ? { OR: [{ unitId: null }, { unitId: query.unitId }] } : scope.allUnitsInCompanies ? {} : { OR: [{ unitId: null }, { unitId: { in: scope.unitIds } }] }) }, orderBy: { date: "asc" } }),
      prisma.schedulePeriod.findMany({ where: { companyId: { in: companyIds }, competence: from, ...(query.unitId ? { OR: [{ unitId: null }, { unitId: query.unitId }] } : scope.allUnitsInCompanies ? {} : { OR: [{ unitId: null }, { unitId: { in: scope.unitIds } }] }) } })
    ]);
    const employeeIds = employees.map((employee) => employee.id);
    const [schedules, attendances] = employeeIds.length ? await Promise.all([
      prisma.workSchedule.findMany({ where: { employeeId: { in: employeeIds }, scheduleDate: { gte: from, lte: until }, status: WorkScheduleStatus.ATIVA, shiftId: query.shiftId }, include: { shift: true }, orderBy: [{ scheduleDate: "asc" }, { startAt: "asc" }] }),
      prisma.dailyAttendance.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: from, lte: until }, deletedAt: null }, include: { frequencyType: true }, orderBy: { date: "asc" } })
    ]) : [[], []];
    const rows = employees.map((employee) => {
      const employeeSchedules = schedules.filter((item) => item.employeeId === employee.id);
      const employeeAttendance = attendances.filter((item) => item.employeeId === employee.id);
      const byDate = new Map<string, { schedule?: unknown; attendance?: unknown }>();
      for (const schedule of employeeSchedules) byDate.set(dateKey(schedule.scheduleDate ?? schedule.startAt), { ...(byDate.get(dateKey(schedule.scheduleDate ?? schedule.startAt)) ?? {}), schedule });
      for (const attendance of employeeAttendance) byDate.set(dateKey(attendance.date), { ...(byDate.get(dateKey(attendance.date)) ?? {}), attendance });
      const summaryRows: Array<{ plannedMinutes?: number | null; frequency?: { code: string; countsAsPresence: boolean; countsAsAbsence: boolean }; status?: typeof employeeAttendance[number]["status"] }> = [
        ...employeeSchedules.map((schedule) => ({ plannedMinutes: schedule.plannedMinutes })),
        ...employeeAttendance.map((attendance) => ({ frequency: attendance.frequencyType, status: attendance.status }))
      ];
      return { employee, cells: Object.fromEntries(byDate), summary: monthlyAttendanceSummary(summaryRows) };
    });
    return { competence: query.competence, rows, total, page: query.page, pageSize: query.pageSize, holidays, periods };
  });

  app.get("/hr/workforce/export", { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.SCHEDULE_EXPORT, HrPermission.REPORT_EXPORT)] }, async (request, reply) => {
    const query = z.object({ competence: z.string().regex(/^\d{4}-\d{2}$/), companyId: z.string(), unitId: z.string().optional(), departmentId: z.string().optional(), teamId: z.string().optional(), shiftId: z.string().optional() }).parse(request.query);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, query.companyId); assertUnitAccess(scope, query.unitId);
    const from = startOfCompetence(`${query.competence}-01`); const until = endOfCompetence(from);
    const employees = await prisma.employee.findMany({ where: { companyId: query.companyId, unitId: unitScopeFilter(scope, query.unitId), departmentId: query.departmentId, teamId: query.teamId, isActive: true }, select: { id: true, name: true, registration: true, unitRef: { select: { name: true } }, departmentRef: { select: { name: true } } }, orderBy: { name: "asc" }, take: 5001 });
    if (employees.length > 5000) return reply.code(413).send({ message: "A exportacao excede 5.000 funcionarios; refine os filtros" });
    const employeeIds = employees.map((employee) => employee.id);
    const [schedules, attendances] = employeeIds.length ? await Promise.all([
      prisma.workSchedule.findMany({ where: { employeeId: { in: employeeIds }, scheduleDate: { gte: from, lte: until }, status: WorkScheduleStatus.ATIVA, shiftId: query.shiftId }, include: { shift: { select: { code: true } } } }),
      prisma.dailyAttendance.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: from, lte: until }, deletedAt: null }, include: { frequencyType: { select: { shortCode: true } } } })
    ]) : [[], []];
    const dayCount = until.getUTCDate();
    const scheduleByKey = new Map(schedules.map((item) => [`${item.employeeId}:${dateKey(item.scheduleDate ?? item.startAt)}`, item]));
    const attendanceByKey = new Map(attendances.map((item) => [`${item.employeeId}:${dateKey(item.date)}`, item]));
    const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = ["Matricula", "Funcionario", "Unidade", "Setor", ...Array.from({ length: dayCount }, (_, index) => String(index + 1).padStart(2, "0"))];
    const lines = [headers.map(csvCell).join(";")];
    for (const employee of employees) {
      const values: unknown[] = [employee.registration, employee.name, employee.unitRef?.name, employee.departmentRef?.name];
      for (let day = 1; day <= dayCount; day += 1) {
        const date = `${query.competence}-${String(day).padStart(2, "0")}`; const key = `${employee.id}:${date}`;
        const actual = attendanceByKey.get(key); const planned = scheduleByKey.get(key);
        values.push(actual?.frequencyType.shortCode ?? (planned?.dayType === "WORK" ? planned.shift?.code ?? "T" : planned?.dayType === "DSR" ? "DSR" : planned?.dayType === "DAY_OFF" ? "F" : planned?.dayType === "HOLIDAY" ? "FD" : ""));
      }
      lines.push(values.map(csvCell).join(";"));
    }
    await writeAudit(prisma, request, { companyId: query.companyId, unitId: query.unitId, action: "WORKFORCE_SCHEDULE_EXPORT", entityType: "SchedulePeriod", entityId: query.competence, metadata: { employeeCount: employees.length, format: "CSV", filters: query } });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="escala-${query.competence}.csv"`);
    return reply.send(`\uFEFF${lines.join("\r\n")}`);
  });

  app.post("/hr/workforce/assignments/preview", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_CREATE, HrPermission.SCHEDULE_MANAGE)] }, async (request) => {
    const body = assignmentInput.parse(request.body);
    const preview = await buildAssignmentPreview(request, body);
    return { previewHash: preview.previewHash, recordCount: preview.recordCount, employeeCount: preview.employees.length, dayCount: preview.days.length, conflicts: preview.conflicts, sample: preview.days.slice(0, 14) };
  });

  app.post("/hr/workforce/assignments", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_BULK_EDIT, HrPermission.SCHEDULE_MANAGE)] }, async (request, reply) => {
    const body = assignmentInput.extend({ previewHash: z.string().length(64) }).parse(request.body);
    const preview = await buildAssignmentPreview(request, body);
    if (body.previewHash !== preview.previewHash) return reply.code(409).send({ message: "A previa expirou; gere uma nova previa" });
    if (preview.conflicts.length && !body.allowConflicts) return reply.code(409).send({ message: "Existem conflitos na aplicacao", conflicts: preview.conflicts });
    const created = await prisma.$transaction(async (tx) => {
      const employeeUnitIds = [...new Set(preview.employees.flatMap((employee) => employee.unitId ? [employee.unitId] : []))];
      const transactionPeriodUnitFilter = body.unitId ? { OR: [{ unitId: null }, { unitId: body.unitId }] } : { OR: [{ unitId: null }, ...(employeeUnitIds.length ? [{ unitId: { in: employeeUnitIds } }] : [])] };
      const closedPeriod = await tx.schedulePeriod.findFirst({ where: { companyId: body.companyId, competence: { gte: startOfCompetence(body.validFrom), lte: startOfCompetence(body.validUntil) }, status: SchedulePeriodStatus.CLOSED, ...transactionPeriodUnitFilter } });
      if (closedPeriod) throw new Error("A competencia foi fechada depois da previa");
      const liveExisting = await tx.workSchedule.findMany({ where: { companyId: body.companyId, employeeId: { in: body.employeeIds }, status: WorkScheduleStatus.ATIVA, startAt: { lt: new Date(Math.max(...preview.days.map((item) => item.endAt.getTime())) + 1) }, endAt: { gt: new Date(Math.min(...preview.days.map((item) => item.startAt.getTime())) - 1) } }, select: { id: true, employeeId: true, startAt: true, endAt: true } });
      const result: Array<{ assignmentId: string; employeeId: string; schedules: number }> = [];
      for (const employee of preview.employees) {
        const assignment = await tx.scheduleAssignment.create({ data: { companyId: body.companyId, employeeId: employee.id, patternId: body.patternId, unitId: body.unitId ?? employee.unitId, departmentId: body.departmentId ?? employee.departmentId, teamId: body.teamId ?? employee.teamId, validFrom: dateOnly(body.validFrom), validUntil: dateOnly(body.validUntil), cycleOffset: body.cycleOffset, status: ScheduleAssignmentStatus.ACTIVE, notes: body.notes, createdById: request.user.id } });
        let schedules = 0;
        for (const day of preview.days) {
          const overlap = day.plannedMinutes > 0 ? liveExisting.find((item) => item.employeeId === employee.id && intervalsOverlap(day.startAt, day.endAt, item.startAt, item.endAt)) : undefined;
          if (overlap && !body.allowConflicts) throw new Error(`Conflito criado depois da previa para ${employee.name} em ${day.date}`);
          if (overlap) continue;
          await tx.workSchedule.create({ data: { companyId: body.companyId, unitId: assignment.unitId, departmentId: assignment.departmentId, teamId: assignment.teamId, employeeId: employee.id, shiftId: day.shiftId, assignmentId: assignment.id, patternDayId: preview.pattern.days.find((item) => item.cyclePosition === day.cyclePosition)?.id, scheduleDate: dateOnly(day.date), dayType: day.dayType, origin: ScheduleOrigin.PATTERN, breakMinutes: day.breakMinutes ?? 0, plannedMinutes: day.plannedMinutes, startAt: day.startAt, endAt: day.endAt, status: WorkScheduleStatus.ATIVA, createdById: request.user.id } });
          schedules += 1;
        }
        await writeAudit(tx, request, { companyId: body.companyId, unitId: assignment.unitId, action: "SCHEDULE_ASSIGNMENT_APPLY", entityType: "ScheduleAssignment", entityId: assignment.id, newValue: assignment, metadata: { schedules, previewHash: body.previewHash } });
        result.push({ assignmentId: assignment.id, employeeId: employee.id, schedules });
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    return reply.code(201).send({ assignments: created, recordsCreated: created.reduce((sum, item) => sum + item.schedules, 0) });
  });

  app.post("/hr/workforce/schedule-days", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_CREATE, HrPermission.SCHEDULE_MANAGE)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), employeeId: z.string().cuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dayType: z.enum(["WORK", "DSR", "DAY_OFF", "HOLIDAY"]), shiftId: z.string().cuid().optional().nullable(), startMinute: z.number().int().min(0).max(1439).optional().nullable(), endMinute: z.number().int().min(0).max(1439).optional().nullable(), breakMinutes: z.number().int().min(0).max(720).optional(), crossesMidnight: z.boolean().default(false), notes: z.string().max(1000).optional().nullable() }).parse(request.body);
    const scope = await resolveHrDataScope(request); assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    const [employee, shift, existingDate] = await Promise.all([
      prisma.employee.findFirst({ where: { id: body.employeeId, companyId: body.companyId, unitId: unitScopeFilter(scope, body.unitId ?? undefined) } }),
      body.shiftId ? prisma.workShift.findFirst({ where: { id: body.shiftId, companyId: body.companyId, isActive: true } }) : null,
      prisma.workSchedule.findFirst({ where: { employeeId: body.employeeId, scheduleDate: dateOnly(body.date), status: WorkScheduleStatus.ATIVA }, select: { id: true } })
    ]);
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado ou fora do escopo" });
    assertEmployeePeriod(employee, dateOnly(body.date));
    const effectiveUnitId = body.unitId ?? employee.unitId;
    const closedPeriod = await prisma.schedulePeriod.findFirst({ where: { companyId: body.companyId, competence: startOfCompetence(body.date), status: SchedulePeriodStatus.CLOSED, OR: [{ unitId: null }, ...(effectiveUnitId ? [{ unitId: effectiveUnitId }] : [])] } });
    if (body.shiftId && !shift) return reply.code(400).send({ message: "Turno inexistente ou inativo" });
    if (closedPeriod) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
    if (existingDate) return reply.code(409).send({ message: "Ja existe planejamento nesta data", scheduleId: existingDate.id });
    const definition = { cyclePosition: 1, dayType: body.dayType, shiftId: shift?.id, startMinute: body.startMinute ?? shift?.startMinute, endMinute: body.endMinute ?? shift?.endMinute, breakMinutes: body.breakMinutes ?? shift?.breakMinutes ?? 0, crossesMidnight: body.startMinute !== undefined || body.endMinute !== undefined ? body.crossesMidnight : (shift?.crossesMidnight ?? body.crossesMidnight) };
    const interval = intervalForPatternDay(body.date, definition);
    if (body.dayType === "WORK") {
      const conflict = await prisma.workSchedule.findFirst({ where: { employeeId: employee.id, status: WorkScheduleStatus.ATIVA, startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } }, select: { id: true } });
      if (conflict) return reply.code(409).send({ message: "A escala gera sobreposicao", conflictId: conflict.id });
    }
    const created = await prisma.$transaction(async (tx) => { const row = await tx.workSchedule.create({ data: { companyId: body.companyId, unitId: effectiveUnitId, departmentId: employee.departmentId, teamId: employee.teamId, employeeId: employee.id, shiftId: shift?.id, scheduleDate: dateOnly(body.date), dayType: body.dayType, origin: ScheduleOrigin.MANUAL, breakMinutes: definition.breakMinutes, plannedMinutes: interval.plannedMinutes, startAt: interval.startAt, endAt: interval.endAt, notes: body.notes, createdById: request.user.id } }); await writeAudit(tx, request, { companyId: body.companyId, unitId: effectiveUnitId, action: "WORK_SCHEDULE_DAY_CREATE", entityType: "WorkSchedule", entityId: row.id, newValue: row }); return row; });
    return reply.code(201).send(created);
  });

  app.patch("/hr/workforce/schedule-days/:id", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_EDIT, HrPermission.SCHEDULE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ shiftId: z.string().cuid().optional().nullable(), dayType: z.enum(["WORK", "DSR", "DAY_OFF", "HOLIDAY"]).optional(), startAt: z.coerce.date().optional(), endAt: z.coerce.date().optional(), notes: z.string().max(1000).optional().nullable(), status: z.enum(["ATIVA", "INATIVA", "CANCELADA"]).optional() }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.workSchedule.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope) } });
    if (!existing) return reply.code(404).send({ message: "Dia de escala nao encontrado" });
    const period = await prisma.schedulePeriod.findFirst({ where: { companyId: existing.companyId, competence: startOfCompetence(existing.scheduleDate ?? existing.startAt), OR: [{ unitId: null }, ...(existing.unitId ? [{ unitId: existing.unitId }] : [])], status: SchedulePeriodStatus.CLOSED } });
    if (period) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
    if (body.endAt && body.startAt && body.endAt <= body.startAt) return reply.code(400).send({ message: "Horario final deve ser posterior ao inicial" });
    if (body.shiftId) await assertOrganizationReferences(existing.companyId, { shiftId: body.shiftId });
    const startAt = body.startAt ?? existing.startAt; const endAt = body.endAt ?? existing.endAt;
    const conflict = await prisma.workSchedule.findFirst({ where: { id: { not: existing.id }, employeeId: existing.employeeId, status: WorkScheduleStatus.ATIVA, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { id: true } });
    if (conflict && (body.status ?? existing.status) === WorkScheduleStatus.ATIVA) return reply.code(409).send({ message: "A alteracao gera sobreposicao", conflictId: conflict.id });
    const dayType = body.dayType ?? existing.dayType;
    const planned = dayType === "WORK" ? Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 60_000) - existing.breakMinutes) : 0;
    const updated = await prisma.$transaction(async (tx) => { const row = await tx.workSchedule.update({ where: { id: existing.id }, data: { ...body, scheduleDate: body.startAt ? dateOnly(body.startAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) : undefined, plannedMinutes: planned, origin: ScheduleOrigin.EXCEPTION, updatedById: request.user.id } }); await writeAudit(tx, request, { companyId: existing.companyId, unitId: existing.unitId, action: "WORK_SCHEDULE_DAY_UPDATE", entityType: "WorkSchedule", entityId: existing.id, previousValue: existing, newValue: row }); return row; });
    return updated;
  });
}
