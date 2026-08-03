import type { FastifyInstance } from "fastify";
import { HrPermission, Prisma, ScheduleOrigin, SchedulePeriodStatus, WorkScheduleStatus } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, requireAnyHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { buildScheduleInterval, enumerateScheduleDates } from "../services/schedules.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";
import { dateOnly, startOfCompetence } from "../services/workforceSchedules.js";
import { requireWorkScheduleEnabled } from "../services/hrFeatureGuards.js";

const scheduleSelect = {
  id: true,
  companyId: true,
  unitId: true,
  startAt: true,
  endAt: true,
  status: true,
  breakMinutes: true,
  plannedMinutes: true,
  seriesId: true,
  notes: true,
  employee: { select: { id: true, name: true, registration: true, department: true, position: true } },
  team: { select: { id: true, name: true } },
  shift: { select: { id: true, name: true, startMinute: true, endMinute: true, crossesMidnight: true } },
  createdBy: { select: { id: true, email: true } },
  updatedAt: true
} as const;

export async function hrScheduleRoutes(app: FastifyInstance) {
  app.get(
    "/hr/schedules",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.SCHEDULE_VIEW)] },
    async (request) => {
      const query = z.object({
        start: z.coerce.date(),
        end: z.coerce.date(),
        unitId: z.string().optional(),
        employeeId: z.string().cuid().optional(),
        teamId: z.string().optional(),
        status: z.nativeEnum(WorkScheduleStatus).default(WorkScheduleStatus.ATIVA),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(100)
      }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      const where = {
        companyId: { in: scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        employeeId: query.employeeId,
        teamId: query.teamId,
        status: query.status,
        startAt: { lt: query.end },
        endAt: { gt: query.start }
      };
      const [items, total] = await prisma.$transaction([
        prisma.workSchedule.findMany({
          where,
          select: scheduleSelect,
          orderBy: [{ startAt: "asc" }, { employee: { name: "asc" } }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.workSchedule.count({ where })
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
  );

  app.post(
    "/hr/schedules",
    { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_CREATE, HrPermission.SCHEDULE_MANAGE)] },
    async (request, reply) => {
      const body = z.object({
        companyId: z.string(),
        unitId: z.string().optional().nullable(),
        employeeIds: z.array(z.string().cuid()).max(100).default([]),
        teamId: z.string().optional().nullable(),
        shiftId: z.string().optional().nullable(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        notes: z.string().max(1000).optional().nullable(),
        allowConflicts: z.boolean().default(false)
      }).refine((value) => value.employeeIds.length > 0 || Boolean(value.teamId), {
        message: "Informe ao menos um funcionario ou equipe"
      }).parse(request.body);

      const scope = await resolveHrDataScope(request);
      assertCompanyAccess(scope, body.companyId);
      assertUnitAccess(scope, body.unitId);
      await assertOrganizationReferences(body.companyId, body);
      const employeeIds = new Set(body.employeeIds);
      if (body.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: body.teamId, companyId: body.companyId, isActive: true },
          select: { employees: { where: { isActive: true }, select: { id: true } } }
        });
        if (!team) return reply.code(400).send({ message: "Equipe invalida" });
        for (const employee of team.employees) employeeIds.add(employee.id);
      }
      const employees = await prisma.employee.findMany({
        where: { id: { in: [...employeeIds] }, companyId: body.companyId, isActive: true },
        select: { id: true, unitId: true, departmentId: true, department: true, position: true }
      });
      if (employees.length !== employeeIds.size) return reply.code(400).send({ message: "Um ou mais funcionarios sao invalidos ou inativos" });
      for (const employee of employees) assertUnitAccess(scope, employee.unitId);

      const dates = enumerateScheduleDates(body.startDate, body.endDate ?? body.startDate, body.weekdays);
      if (dates.length * employees.length > 500) return reply.code(400).send({ message: "A operacao excede o limite de 500 turnos; reduza o periodo ou a equipe" });
      const affectedUnits = body.unitId ? [body.unitId] : employees.flatMap((employee) => employee.unitId ? [employee.unitId] : []);
      const closedPeriod = await prisma.schedulePeriod.findFirst({ where: { companyId: body.companyId, competence: { gte: startOfCompetence(body.startDate), lte: startOfCompetence(body.endDate ?? body.startDate) }, status: SchedulePeriodStatus.CLOSED, OR: [{ unitId: null }, ...affectedUnits.map((unitId) => ({ unitId }))] } });
      if (closedPeriod) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
      const shift = body.shiftId ? await prisma.workShift.findUnique({ where: { id: body.shiftId }, select: { breakMinutes: true } }) : null;
      const seriesId = dates.length > 1 || employees.length > 1 ? `series_${nanoid()}` : null;
      const planned = employees.flatMap((employee) => dates.map((date) => ({ employee, date, ...buildScheduleInterval(date, body.startTime, body.endTime) })));

      try {
        const result = await prisma.$transaction(async (tx) => {
          const conflicts: Array<{ employeeId: string; scheduleId: string; startAt: Date; endAt: Date }> = [];
          for (const item of planned) {
            const existing = await tx.workSchedule.findFirst({
              where: {
                employeeId: item.employee.id,
                status: WorkScheduleStatus.ATIVA,
                startAt: { lt: item.endAt },
                endAt: { gt: item.startAt }
              },
              select: { id: true, startAt: true, endAt: true }
            });
            if (existing) conflicts.push({ employeeId: item.employee.id, scheduleId: existing.id, startAt: existing.startAt, endAt: existing.endAt });
          }
          if (conflicts.length && !body.allowConflicts) {
            const conflictError = new Error("Conflito de horario detectado") as Error & { conflicts?: typeof conflicts };
            conflictError.conflicts = conflicts;
            throw conflictError;
          }

          const created = [];
          for (const item of planned) {
            created.push(await tx.workSchedule.create({
              data: {
                companyId: body.companyId,
                unitId: body.unitId ?? item.employee.unitId,
                employeeId: item.employee.id,
                departmentId: item.employee.departmentId,
                teamId: body.teamId,
                shiftId: body.shiftId,
                scheduleDate: dateOnly(item.date),
                origin: ScheduleOrigin.MANUAL,
                breakMinutes: shift?.breakMinutes ?? 0,
                plannedMinutes: Math.max(0, Math.floor((item.endAt.getTime() - item.startAt.getTime()) / 60_000) - (shift?.breakMinutes ?? 0)),
                startAt: item.startAt,
                endAt: item.endAt,
                seriesId,
                notes: body.notes,
                createdById: request.user.id
              },
              select: scheduleSelect
            }));
          }
          await writeAudit(tx, request, {
            companyId: body.companyId,
            unitId: body.unitId,
            action: "SCHEDULE_CREATE",
            entityType: "WorkScheduleSeries",
            entityId: seriesId ?? created[0]?.id ?? "unknown",
            newValue: { count: created.length, employeeIds: [...employeeIds], dates, startTime: body.startTime, endTime: body.endTime },
            metadata: { conflictsAccepted: conflicts.length }
          });
          return { items: created, conflicts };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof Error && "conflicts" in error) {
          return reply.code(409).send({ message: error.message, conflicts: (error as any).conflicts });
        }
        throw error;
      }
    }
  );

  app.patch(
    "/hr/schedules/:id",
    { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_EDIT, HrPermission.SCHEDULE_MANAGE)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = z.object({
        status: z.nativeEnum(WorkScheduleStatus).optional(),
        startAt: z.coerce.date().optional(),
        endAt: z.coerce.date().optional(),
        notes: z.string().max(1000).optional().nullable()
      }).parse(request.body);
      const scope = await resolveHrDataScope(request);
      const existing = await prisma.workSchedule.findFirst({
        where: { id: params.id, companyId: { in: scope.companyIds } },
        select: scheduleSelect
      });
      if (!existing) return reply.code(404).send({ message: "Escala nao encontrada" });
      assertUnitAccess(scope, existing.unitId);
      const closedPeriod = await prisma.schedulePeriod.findFirst({ where: { companyId: existing.companyId, competence: startOfCompetence(existing.startAt), status: SchedulePeriodStatus.CLOSED, OR: [{ unitId: null }, ...(existing.unitId ? [{ unitId: existing.unitId }] : [])] } });
      if (closedPeriod) return reply.code(409).send({ message: "Competencia fechada para alteracoes" });
      const startAt = body.startAt ?? existing.startAt;
      const endAt = body.endAt ?? existing.endAt;
      if (endAt <= startAt) return reply.code(400).send({ message: "O fim da escala deve ser posterior ao inicio" });

      if ((body.status ?? existing.status) === WorkScheduleStatus.ATIVA) {
        const conflict = await prisma.workSchedule.findFirst({
          where: { id: { not: existing.id }, employeeId: existing.employee.id, status: WorkScheduleStatus.ATIVA, startAt: { lt: endAt }, endAt: { gt: startAt } },
          select: { id: true, startAt: true, endAt: true }
        });
        if (conflict) return reply.code(409).send({ message: "Conflito de horario detectado", conflict });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const schedule = await tx.workSchedule.update({
          where: { id: existing.id },
          data: { status: body.status, startAt: body.startAt, endAt: body.endAt, scheduleDate: body.startAt ? dateOnly(body.startAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) : undefined, plannedMinutes: Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 60_000) - existing.breakMinutes), notes: body.notes, origin: ScheduleOrigin.EXCEPTION, updatedById: request.user.id },
          select: scheduleSelect
        });
        await writeAudit(tx, request, {
          companyId: existing.companyId,
          unitId: existing.unitId,
          action: "SCHEDULE_UPDATE",
          entityType: "WorkSchedule",
          entityId: existing.id,
          previousValue: existing,
          newValue: schedule
        });
        return schedule;
      });
      return updated;
    }
  );
}
