import type { FastifyInstance } from "fastify";
import { EmployeeOccurrenceType, HrPermission, OccurrenceStatus, Prisma, ScheduleOrigin, SchedulePeriodStatus, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, hasHrPermission, requireAnyHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { assertEmployeePeriod, attendanceDefaultStatus, dateKey, dateOnly, endOfCompetence, startOfCompetence } from "../services/workforceSchedules.js";
import { occurrenceTypePermission } from "../services/occurrenceWorkflow.js";
import { requireWorkScheduleEnabled } from "../services/hrFeatureGuards.js";

function occurrenceTypeFor(code: string, category: string): EmployeeOccurrenceType {
  if (code === "ATEST") return EmployeeOccurrenceType.ATESTADO_MEDICO;
  if (code === "FERIAS") return EmployeeOccurrenceType.FERIAS;
  if (code === "ADVERT") return EmployeeOccurrenceType.ADVERTENCIA;
  if (code === "SUSP") return EmployeeOccurrenceType.SUSPENSAO;
  if (code === "ACID_TRAB") return EmployeeOccurrenceType.ACIDENTE_TRABALHO;
  if (category === "LEAVE") return EmployeeOccurrenceType.AFASTAMENTO;
  if (category === "JUSTIFIED_ABSENCE" || category === "UNJUSTIFIED_ABSENCE") return EmployeeOccurrenceType.FALTA;
  return EmployeeOccurrenceType.OUTRO;
}

async function findClosedPeriod(companyId: string, unitId: string | null | undefined, date: Date) {
  return prisma.schedulePeriod.findFirst({ where: { companyId, competence: startOfCompetence(date), status: SchedulePeriodStatus.CLOSED, OR: [{ unitId: null }, ...(unitId ? [{ unitId }] : [])] } });
}

export async function hrWorkforceAttendanceRoutes(app: FastifyInstance) {
  app.post("/hr/workforce/attendance", { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.FREQUENCY_REGISTER, HrPermission.OCCURRENCE_REGISTER)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), employeeId: z.string().cuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), workScheduleId: z.string().cuid().optional().nullable(), frequencyTypeId: z.string().cuid(), occurrenceId: z.string().cuid().optional().nullable(), hours: z.number().min(0).max(48).optional().nullable(), days: z.number().min(0).max(366).optional().nullable(), notes: z.string().max(2000).optional().nullable(), replaceExisting: z.boolean().default(false) }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    const date = dateOnly(body.date);
    const [employee, frequency, schedule, occurrence, closedPeriod, existing] = await Promise.all([
      prisma.employee.findFirst({ where: { id: body.employeeId, companyId: body.companyId, unitId: unitScopeFilter(scope, body.unitId ?? undefined), isActive: true } }),
      prisma.frequencyType.findFirst({ where: { id: body.frequencyTypeId, companyId: body.companyId, isActive: true } }),
      body.workScheduleId ? prisma.workSchedule.findFirst({ where: { id: body.workScheduleId, companyId: body.companyId, employeeId: body.employeeId, status: WorkScheduleStatus.ATIVA } }) : null,
      body.occurrenceId ? prisma.employeeOccurrence.findFirst({ where: { id: body.occurrenceId, companyId: body.companyId, employeeId: body.employeeId, deletedAt: null }, include: { attachments: { where: { deletedAt: null }, select: { id: true } } } }) : null,
      findClosedPeriod(body.companyId, body.unitId, date),
      prisma.dailyAttendance.findFirst({ where: { employeeId: body.employeeId, date, deletedAt: null } })
    ]);
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado, inativo ou fora do escopo" });
    assertEmployeePeriod(employee, date);
    if (!frequency) return reply.code(400).send({ message: "Tipo de frequencia invalido ou inativo" });
    const occurrencePermission = occurrenceTypePermission(frequency.code);
    if (occurrencePermission && !(await hasHrPermission(request.user.role, occurrencePermission.register))) return reply.code(403).send({ message: "Permissao insuficiente para este tipo de ocorrencia" });
    if (["ADVERT", "SUSP", "ACID_TRAB"].includes(frequency.code)) return reply.code(409).send({ message: "Registre este tipo pelo fluxo Nova ocorrencia para aplicar validacoes, aprovacao e auditoria" });
    if (body.workScheduleId && !schedule) return reply.code(400).send({ message: "Escala diaria invalida" });
    if (schedule && dateKey(schedule.scheduleDate ?? schedule.startAt) !== body.date) return reply.code(400).send({ message: "A escala informada pertence a outra data" });
    if (body.occurrenceId && !occurrence) return reply.code(400).send({ message: "Ocorrencia invalida" });
    if (closedPeriod) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
    if (existing && !body.replaceExisting) return reply.code(409).send({ message: "Ja existe apontamento para o funcionario nesta data", attendanceId: existing.id });
    if (existing && !(await hasHrPermission(request.user.role, HrPermission.SCHEDULE_EDIT)) && !(await hasHrPermission(request.user.role, HrPermission.SCHEDULE_MANAGE))) return reply.code(403).send({ message: "Substituir apontamento exige permissao de edicao" });
    if (frequency.requiresDocument) {
      if (!(await hasHrPermission(request.user.role, HrPermission.CERTIFICATE_REGISTER)) && !(await hasHrPermission(request.user.role, HrPermission.OCCURRENCE_REGISTER))) return reply.code(403).send({ message: "Permissao insuficiente para registrar documento" });
      if (!occurrence?.attachments.length) return reply.code(400).send({ message: "Este tipo de frequencia exige documento anexado a uma ocorrencia" });
    }
    const result = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.dailyAttendance.update({ where: { id: existing.id }, data: { deletedAt: new Date(), updatedById: request.user.id } });
        await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId ?? employee.unitId, action: "DAILY_ATTENDANCE_REPLACE", entityType: "DailyAttendance", entityId: existing.id, previousValue: existing, newValue: { deletedAt: true } });
      }
      let linkedOccurrenceId = occurrence?.id;
      if (!linkedOccurrenceId && (frequency.countsAsAbsence || frequency.requiresApproval || frequency.requiresDocument)) {
        const createdOccurrence = await tx.employeeOccurrence.create({ data: { employeeId: employee.id, companyId: body.companyId, unitId: body.unitId ?? employee.unitId, departmentId: employee.departmentId, departmentNameSnapshot: employee.department, teamId: employee.teamId, frequencyTypeId: frequency.id, type: occurrenceTypeFor(frequency.code, frequency.category), date, startDate: date, endDate: date, description: frequency.name, daysAway: body.days ? Math.ceil(body.days) : 1, hoursAway: body.hours, isJustified: frequency.justifiedAbsence, notes: body.notes, status: attendanceDefaultStatus(frequency), registeredById: request.user.id } });
        linkedOccurrenceId = createdOccurrence.id;
      }
      const attendance = await tx.dailyAttendance.create({ data: { companyId: body.companyId, unitId: body.unitId ?? employee.unitId, employeeId: employee.id, date, workScheduleId: schedule?.id, frequencyTypeId: frequency.id, occurrenceId: linkedOccurrenceId, hours: body.hours, days: body.days, notes: body.notes, status: attendanceDefaultStatus(frequency), origin: ScheduleOrigin.MANUAL, createdById: request.user.id } });
      await writeAudit(tx, request, { companyId: body.companyId, unitId: attendance.unitId, action: "DAILY_ATTENDANCE_CREATE", entityType: "DailyAttendance", entityId: attendance.id, newValue: attendance, metadata: { frequencyCode: frequency.code } });
      return attendance;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return reply.code(201).send(result);
  });

  app.post("/hr/workforce/attendance/:id/review", { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.CERTIFICATE_APPROVE, HrPermission.OCCURRENCE_REVIEW)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ status: z.enum([OccurrenceStatus.EM_ANALISE, OccurrenceStatus.APROVADO, OccurrenceStatus.REJEITADO, OccurrenceStatus.CANCELADO]), reason: z.string().min(3).max(1000) }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.dailyAttendance.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: { frequencyType: true, occurrence: { include: { attachments: { where: { deletedAt: null }, select: { id: true } } } } } });
    if (!existing) return reply.code(404).send({ message: "Apontamento nao encontrado" });
    if (await findClosedPeriod(existing.companyId, existing.unitId, existing.date)) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
    if (body.status === OccurrenceStatus.APROVADO && existing.frequencyType.requiresDocument && !existing.occurrence?.attachments.length) return reply.code(400).send({ message: "Nao e possivel aprovar sem documento" });
    const updated = await prisma.$transaction(async (tx) => {
      const attendance = await tx.dailyAttendance.update({ where: { id: existing.id }, data: { status: body.status, approvedById: request.user.id, approvedAt: body.status === OccurrenceStatus.APROVADO ? new Date() : null, updatedById: request.user.id } });
      if (existing.occurrenceId) await tx.employeeOccurrence.update({ where: { id: existing.occurrenceId }, data: { status: body.status, reviewedById: request.user.id, reviewedAt: new Date() } });
      await writeAudit(tx, request, { companyId: existing.companyId, unitId: existing.unitId, action: "DAILY_ATTENDANCE_REVIEW", entityType: "DailyAttendance", entityId: existing.id, previousValue: { status: existing.status }, newValue: { status: body.status }, metadata: { reason: body.reason } });
      return attendance;
    });
    return updated;
  });

  app.post("/hr/workforce/periods/review", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_PERIOD_CLOSE)] }, async (request) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), competence: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().min(3).max(1000) }).parse(request.body);
    const scope = await resolveHrDataScope(request); assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    if (!body.unitId && !scope.allUnitsInCompanies) throw new Error("Informe uma unidade dentro do escopo autorizado");
    const competence = startOfCompetence(`${body.competence}-01`);
    const existing = await prisma.schedulePeriod.findFirst({ where: { companyId: body.companyId, unitId: body.unitId ?? null, competence } });
    return prisma.$transaction(async (tx) => {
      const period = existing ? await tx.schedulePeriod.update({ where: { id: existing.id }, data: { status: SchedulePeriodStatus.REVIEW } }) : await tx.schedulePeriod.create({ data: { companyId: body.companyId, unitId: body.unitId, competence, status: SchedulePeriodStatus.REVIEW } });
      await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: "SCHEDULE_PERIOD_REVIEW", entityType: "SchedulePeriod", entityId: period.id, previousValue: existing, newValue: period, metadata: { reason: body.reason } });
      return period;
    });
  });

  app.post("/hr/workforce/periods/close", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_PERIOD_CLOSE)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), competence: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().min(3).max(1000) }).parse(request.body);
    const scope = await resolveHrDataScope(request); assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    if (!body.unitId && !scope.allUnitsInCompanies) return reply.code(403).send({ message: "Informe uma unidade dentro do escopo autorizado" });
    const from = startOfCompetence(`${body.competence}-01`); const until = endOfCompetence(from);
    const [pending, schedules] = await Promise.all([
      prisma.dailyAttendance.count({ where: { companyId: body.companyId, unitId: body.unitId ?? undefined, date: { gte: from, lte: until }, deletedAt: null, status: { in: [OccurrenceStatus.PENDENTE, OccurrenceStatus.EM_ANALISE] } } }),
      prisma.workSchedule.findMany({ where: { companyId: body.companyId, unitId: body.unitId ?? undefined, scheduleDate: { gte: from, lte: until }, status: WorkScheduleStatus.ATIVA }, select: { id: true, employeeId: true, scheduleDate: true, startAt: true, endAt: true }, orderBy: [{ employeeId: "asc" }, { startAt: "asc" }] })
    ]);
    const conflicts: string[] = [];
    for (let i = 1; i < schedules.length; i += 1) if (schedules[i].employeeId === schedules[i - 1].employeeId && schedules[i].startAt < schedules[i - 1].endAt) conflicts.push(schedules[i].id);
    if (pending || conflicts.length) return reply.code(409).send({ message: "Competencia possui pendencias", pendingAttendances: pending, conflictIds: conflicts.slice(0, 100) });
    const existing = await prisma.schedulePeriod.findFirst({ where: { companyId: body.companyId, unitId: body.unitId ?? null, competence: from } });
    const closed = await prisma.$transaction(async (tx) => {
      const period = existing ? await tx.schedulePeriod.update({ where: { id: existing.id }, data: { status: SchedulePeriodStatus.CLOSED, closeReason: body.reason, closedById: request.user.id, closedAt: new Date() } }) : await tx.schedulePeriod.create({ data: { companyId: body.companyId, unitId: body.unitId, competence: from, status: SchedulePeriodStatus.CLOSED, closeReason: body.reason, closedById: request.user.id, closedAt: new Date() } });
      await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: "SCHEDULE_PERIOD_CLOSE", entityType: "SchedulePeriod", entityId: period.id, previousValue: existing, newValue: period, metadata: { reason: body.reason } });
      return period;
    });
    return closed;
  });

  app.post("/hr/workforce/periods/reopen", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_PERIOD_REOPEN)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), competence: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().min(10).max(1000) }).parse(request.body);
    const scope = await resolveHrDataScope(request); assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    if (!body.unitId && !scope.allUnitsInCompanies) return reply.code(403).send({ message: "Informe uma unidade dentro do escopo autorizado" });
    const existing = await prisma.schedulePeriod.findFirst({ where: { companyId: body.companyId, unitId: body.unitId ?? null, competence: startOfCompetence(`${body.competence}-01`), status: SchedulePeriodStatus.CLOSED } });
    if (!existing) return reply.code(404).send({ message: "Competencia fechada nao encontrada" });
    const reopened = await prisma.$transaction(async (tx) => { const period = await tx.schedulePeriod.update({ where: { id: existing.id }, data: { status: SchedulePeriodStatus.REOPENED, reopenReason: body.reason, reopenedById: request.user.id, reopenedAt: new Date() } }); await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: "SCHEDULE_PERIOD_REOPEN", entityType: "SchedulePeriod", entityId: existing.id, previousValue: existing, newValue: period, metadata: { reason: body.reason } }); return period; });
    return reopened;
  });
}
