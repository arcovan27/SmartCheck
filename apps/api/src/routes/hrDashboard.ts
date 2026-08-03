import type { FastifyInstance } from "fastify";
import { EmployeeOccurrenceType, EpiMovementType, HrPermission, OccurrenceStatus, Prisma, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { assertCompanyAccess, hasHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { calculateCostVariation } from "../services/epiCosts.js";
import { env } from "../env.js";
import { inclusiveDateRange, inclusiveStoredCivilDateRange } from "../services/hrSafety.js";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function localDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function startOfCurrentMonthKey() {
  return `${localDateKey().slice(0, 7)}-01`;
}

export async function hrDashboardRoutes(app: FastifyInstance) {
  app.get(
    "/hr/dashboard/filters",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.HR_DASHBOARD_VIEW)] },
    async (request) => {
      const scope = await resolveHrDataScope(request);
      const companyWhere = { id: { in: scope.companyIds } };
      const [companies, units, departments, positions, teams, shifts, employees, epiCategories, absenceReasons] = await Promise.all([
        prisma.company.findMany({ where: companyWhere, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" } }),
        prisma.unit.findMany({ where: { companyId: { in: scope.companyIds }, id: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds }, isActive: true }, select: { id: true, companyId: true, name: true }, orderBy: { name: "asc" } }),
        prisma.department.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true, deletedAt: null }, select: { id: true, companyId: true, name: true }, orderBy: { name: "asc" } }),
        prisma.position.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, select: { id: true, companyId: true, name: true }, orderBy: { name: "asc" } }),
        prisma.team.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, select: { id: true, companyId: true, unitId: true, name: true }, orderBy: { name: "asc" } }),
        prisma.workShift.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, select: { id: true, companyId: true, name: true }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({ where: { companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds }, isActive: true }, select: { id: true, companyId: true, unitId: true, name: true, registration: true }, orderBy: { name: "asc" }, take: 500 }),
        prisma.epi.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
        prisma.absenceReason.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, select: { id: true, companyId: true, name: true, occurrenceType: true, frequencyType: { select: { code: true, name: true } } }, orderBy: { name: "asc" } })
      ]);
      return { companies, units, departments, positions, teams, shifts, employees, epiCategories: epiCategories.map((item) => item.category), absenceReasons };
    }
  );

  app.get(
    "/hr/dashboard",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.HR_DASHBOARD_VIEW)] },
    async (request, reply) => {
      const query = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(startOfCurrentMonthKey()),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(localDateKey()),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        departmentId: z.string().optional(),
        positionId: z.string().optional(),
        employeeId: z.string().cuid().optional(),
        teamId: z.string().optional(),
        shiftId: z.string().optional(),
        epiCategory: z.string().optional(),
        occurrenceType: z.nativeEnum(EmployeeOccurrenceType).optional(),
        occurrenceStatus: z.nativeEnum(OccurrenceStatus).optional()
      }).parse(request.query);
      let range: ReturnType<typeof inclusiveDateRange>;
      try {
        range = inclusiveDateRange(query.startDate, query.endDate, env.APP_TIMEZONE);
      } catch (error) {
        return reply.code(400).send({ message: error instanceof Error ? error.message : "Periodo invalido" });
      }
      const { start, endExclusive, endInclusive } = range;
      const occurrenceRange = inclusiveStoredCivilDateRange(query.startDate, query.endDate, env.APP_TIMEZONE);
      const scope = await resolveHrDataScope(request);
      if (scope.companyIds.length === 0) return reply.code(403).send({ message: "Usuario sem empresa autorizada" });
      if (query.companyId) assertCompanyAccess(scope, query.companyId);
      const companyIds = query.companyId ? [query.companyId] : scope.companyIds;
      const unitIdFilter = unitScopeFilter(scope, query.unitId);
      const employeeWhere: Prisma.EmployeeWhereInput = {
        companyId: { in: companyIds },
        unitId: unitIdFilter,
        departmentId: query.departmentId,
        positionId: query.positionId,
        teamId: query.teamId,
        id: query.employeeId
      };
      const occurrenceWhere: Prisma.EmployeeOccurrenceWhereInput = {
        companyId: { in: companyIds },
        unitId: unitIdFilter,
        employeeId: query.employeeId,
        employee: { positionId: query.positionId, teamId: query.teamId },
        type: query.occurrenceType,
        status: query.occurrenceStatus
          ? { in: ([OccurrenceStatus.PENDENTE, OccurrenceStatus.EM_ANALISE, OccurrenceStatus.APROVADO] as OccurrenceStatus[]).includes(query.occurrenceStatus) ? [query.occurrenceStatus] : [] }
          : { in: [OccurrenceStatus.PENDENTE, OccurrenceStatus.EM_ANALISE, OccurrenceStatus.APROVADO] },
        deletedAt: null,
        AND: [
          {
            OR: [
              { startDate: { gte: occurrenceRange.start, lt: occurrenceRange.endExclusive } },
              { startDate: { lt: occurrenceRange.start }, endDate: { gte: occurrenceRange.start } },
              { startDate: null, date: { gte: occurrenceRange.start, lt: occurrenceRange.endExclusive } }
            ]
          },
          ...(query.departmentId ? [{
            OR: [
              { departmentId: query.departmentId },
              { departmentId: null, employee: { departmentId: query.departmentId } }
            ]
          }] : [])
        ]
      };
      const epiWhere = { companyId: { in: companyIds }, unitId: unitIdFilter, category: query.epiCategory };
      const deliveryWhere = {
        companyId: { in: companyIds },
        unitId: unitIdFilter,
        employeeId: query.employeeId,
        employee: { departmentId: query.departmentId, positionId: query.positionId, teamId: query.teamId },
        epi: { category: query.epiCategory },
        date: { gte: start, lt: endExclusive }
      };
      const now = new Date();

      const [
        activeEmployees,
        admittedEmployees,
        dismissedEmployees,
        awayEmployees,
        employeeDepartments,
        totalEpis,
        episForStock,
        delivered,
        returned,
        substituted,
        expiringEpis,
        expiredEpis,
        absenceTotal,
        justifiedAbsences,
        unjustifiedAbsences,
        medicalCertificates,
        absenceEmployees,
        schedulesToday,
        scheduledHours,
        upcomingSchedules
      ] = await Promise.all([
        prisma.employee.count({ where: { ...employeeWhere, admissionDate: { lte: endInclusive }, OR: [{ isActive: true }, { dismissalDate: { gt: endInclusive } }, { inactiveEffectiveDate: { gt: endInclusive } }] } }),
        prisma.employee.count({ where: { ...employeeWhere, admissionDate: { gte: start, lt: endExclusive } } }),
        prisma.employee.count({ where: { ...employeeWhere, dismissalDate: { gte: start, lt: endExclusive } } }),
        prisma.employeeOccurrence.findMany({ where: { ...occurrenceWhere, status: OccurrenceStatus.APROVADO }, distinct: ["employeeId"], select: { employeeId: true } }),
        prisma.employee.groupBy({ by: ["department"], where: { ...employeeWhere, admissionDate: { lte: endInclusive }, OR: [{ isActive: true }, { dismissalDate: { gt: endInclusive } }, { inactiveEffectiveDate: { gt: endInclusive } }] }, _count: { _all: true }, orderBy: { _count: { department: "desc" } }, take: 8 }),
        prisma.epi.count({ where: epiWhere }),
        prisma.epi.findMany({ where: { ...epiWhere, isActive: true }, select: { stock: true, minimumStock: true } }),
        prisma.epiDelivery.aggregate({ where: { ...deliveryWhere, movementType: EpiMovementType.ENTREGA }, _sum: { quantity: true } }),
        prisma.epiDelivery.aggregate({ where: { ...deliveryWhere, movementType: EpiMovementType.DEVOLUCAO }, _sum: { quantity: true } }),
        prisma.epiDelivery.aggregate({ where: { ...deliveryWhere, movementType: EpiMovementType.SUBSTITUICAO }, _sum: { quantity: true } }),
        prisma.epi.count({ where: { ...epiWhere, validityDate: { gte: start, lt: endExclusive } } }),
        prisma.epi.count({ where: { ...epiWhere, validityDate: { lt: endExclusive } } }),
        prisma.employeeOccurrence.count({ where: occurrenceWhere }),
        prisma.employeeOccurrence.count({ where: { ...occurrenceWhere, type: EmployeeOccurrenceType.FALTA, isJustified: true } }),
        prisma.employeeOccurrence.count({ where: { ...occurrenceWhere, type: EmployeeOccurrenceType.FALTA, isJustified: false } }),
        prisma.employeeOccurrence.count({ where: { ...occurrenceWhere, type: EmployeeOccurrenceType.ATESTADO_MEDICO } }),
        prisma.employeeOccurrence.findMany({ where: occurrenceWhere, distinct: ["employeeId"], select: { employeeId: true } }),
        prisma.workSchedule.count({ where: { companyId: { in: companyIds }, unitId: unitIdFilter, employeeId: query.employeeId, departmentId: query.departmentId, teamId: query.teamId, shiftId: query.shiftId, status: WorkScheduleStatus.ATIVA, startAt: { lt: endExclusive }, endAt: { gt: start } } }),
        prisma.workSchedule.findMany({ where: { companyId: { in: companyIds }, unitId: unitIdFilter, employeeId: query.employeeId, departmentId: query.departmentId, teamId: query.teamId, shiftId: query.shiftId, status: WorkScheduleStatus.ATIVA, startAt: { lt: endExclusive }, endAt: { gt: start } }, select: { startAt: true, endAt: true } }),
        prisma.workSchedule.findMany({ where: { companyId: { in: companyIds }, unitId: unitIdFilter, departmentId: query.departmentId, teamId: query.teamId, shiftId: query.shiftId, status: WorkScheduleStatus.ATIVA, startAt: { gte: start, lt: endExclusive } }, select: scheduleSummarySelect, orderBy: { startAt: "asc" }, take: 8 })
      ]);

      const canViewCosts = await hasHrPermission(request.user.role, HrPermission.EPI_COST_VIEW);
      let costs: null | Record<string, unknown> = null;
      if (canViewCosts) {
        const scopeSql = Prisma.sql`delivery."companyId" IN (${Prisma.join(companyIds)})`;
        const unitSql = query.unitId ? Prisma.sql`AND delivery."unitId" = ${query.unitId}` : Prisma.empty;
        const employeeSql = query.employeeId ? Prisma.sql`AND delivery."employeeId" = ${query.employeeId}` : Prisma.empty;
        const departmentSql = query.departmentId ? Prisma.sql`AND employee."departmentId" = ${query.departmentId}` : Prisma.empty;
        const positionSql = query.positionId ? Prisma.sql`AND employee."positionId" = ${query.positionId}` : Prisma.empty;
        const teamSql = query.teamId ? Prisma.sql`AND employee."teamId" = ${query.teamId}` : Prisma.empty;
        const epiCategorySql = query.epiCategory ? Prisma.sql`AND epi."category" = ${query.epiCategory}` : Prisma.empty;
        const currentRows = await prisma.$queryRaw<Array<{ exactCost: unknown; estimatedCost: unknown }>>(Prisma.sql`
          SELECT
            COALESCE(SUM((delivery."quantity" * delivery."unitCostSnapshot")) FILTER (WHERE delivery."isEstimatedCost" = false), 0) AS "exactCost",
            COALESCE(SUM((delivery."quantity" * delivery."unitCostSnapshot")) FILTER (WHERE delivery."isEstimatedCost" = true), 0) AS "estimatedCost"
          FROM "EpiDelivery" delivery
          JOIN "Employee" employee ON employee."id" = delivery."employeeId"
          JOIN "Epi" epi ON epi."id" = delivery."epiId"
          WHERE ${scopeSql} ${unitSql} ${employeeSql} ${departmentSql} ${positionSql} ${teamSql} ${epiCategorySql}
            AND delivery."movementType" IN ('ENTREGA', 'SUBSTITUICAO')
            AND delivery."date" >= ${start} AND delivery."date" < ${endExclusive}
        `);
        const periodMs = endExclusive.getTime() - start.getTime();
        const previousEnd = start;
        const previousStart = new Date(start.getTime() - periodMs);
        const previousRows = await prisma.$queryRaw<Array<{ exactCost: unknown }>>(Prisma.sql`
          SELECT COALESCE(SUM(delivery."quantity" * delivery."unitCostSnapshot") FILTER (WHERE delivery."isEstimatedCost" = false), 0) AS "exactCost"
          FROM "EpiDelivery" delivery
          JOIN "Employee" employee ON employee."id" = delivery."employeeId"
          JOIN "Epi" epi ON epi."id" = delivery."epiId"
          WHERE ${scopeSql} ${unitSql} ${employeeSql} ${departmentSql} ${positionSql} ${teamSql} ${epiCategorySql}
            AND delivery."movementType" IN ('ENTREGA', 'SUBSTITUICAO')
            AND delivery."date" >= ${previousStart} AND delivery."date" < ${previousEnd}
        `);
        const monthly = await prisma.$queryRaw<Array<{ month: Date; exactCost: unknown; estimatedCost: unknown }>>(Prisma.sql`
          SELECT date_trunc('month', delivery."date") AS month,
            COALESCE(SUM(delivery."quantity" * delivery."unitCostSnapshot") FILTER (WHERE delivery."isEstimatedCost" = false), 0) AS "exactCost",
            COALESCE(SUM(delivery."quantity" * delivery."unitCostSnapshot") FILTER (WHERE delivery."isEstimatedCost" = true), 0) AS "estimatedCost"
          FROM "EpiDelivery" delivery
          JOIN "Employee" employee ON employee."id" = delivery."employeeId"
          JOIN "Epi" epi ON epi."id" = delivery."epiId"
          WHERE ${scopeSql} ${unitSql} ${employeeSql} ${departmentSql} ${positionSql} ${teamSql} ${epiCategorySql}
            AND delivery."movementType" IN ('ENTREGA', 'SUBSTITUICAO')
            AND delivery."date" >= ${start} AND delivery."date" < ${endExclusive}
          GROUP BY date_trunc('month', delivery."date") ORDER BY month
        `);
        const exactCost = toNumber(currentRows[0]?.exactCost);
        const previousCost = toNumber(previousRows[0]?.exactCost);
        costs = {
          exactCost,
          estimatedLegacyCost: toNumber(currentRows[0]?.estimatedCost),
          previousCost,
            variationPercent: calculateCostVariation(exactCost, previousCost),
          monthly: monthly.map((row) => ({ month: row.month, exactCost: toNumber(row.exactCost), estimatedLegacyCost: toNumber(row.estimatedCost) }))
        };
      }

      const stockTotal = episForStock.reduce((total, epi) => total + epi.stock, 0);
      const lowStock = episForStock.filter((epi) => epi.stock <= epi.minimumStock).length;
      const hoursPlanned = scheduledHours.reduce((total, schedule) => total + Math.max(0, schedule.endAt.getTime() - schedule.startAt.getTime()) / 3_600_000, 0);
      let absentScheduledHours = 0;
      if (hoursPlanned > 0) {
        const scheduleUnitSql = query.unitId ? Prisma.sql`AND schedule."unitId" = ${query.unitId}` : Prisma.empty;
        const scheduleEmployeeSql = query.employeeId ? Prisma.sql`AND schedule."employeeId" = ${query.employeeId}` : Prisma.empty;
        const scheduleDepartmentSql = query.departmentId ? Prisma.sql`AND schedule."departmentId" = ${query.departmentId}` : Prisma.empty;
        const scheduleTeamSql = query.teamId ? Prisma.sql`AND schedule."teamId" = ${query.teamId}` : Prisma.empty;
        const scheduleShiftSql = query.shiftId ? Prisma.sql`AND schedule."shiftId" = ${query.shiftId}` : Prisma.empty;
        const schedulePositionSql = query.positionId ? Prisma.sql`AND employee."positionId" = ${query.positionId}` : Prisma.empty;
        const absenceTypeSql = query.occurrenceType ? Prisma.sql`AND occurrence."type" = ${query.occurrenceType}::"EmployeeOccurrenceType"` : Prisma.empty;
        const absenceHours = await prisma.$queryRaw<Array<{ hours: unknown }>>(Prisma.sql`
          WITH overlap_by_schedule AS (
            SELECT schedule."id",
              EXTRACT(EPOCH FROM (schedule."endAt" - schedule."startAt")) / 3600 AS planned_hours,
              SUM(EXTRACT(EPOCH FROM (
                LEAST(schedule."endAt", COALESCE(occurrence."endDate", occurrence."startDate", occurrence."date") + INTERVAL '1 day')
                - GREATEST(schedule."startAt", COALESCE(occurrence."startDate", occurrence."date"))
              )) / 3600) AS absent_hours
            FROM "WorkSchedule" schedule
            JOIN "Employee" employee ON employee."id" = schedule."employeeId"
            JOIN "EmployeeOccurrence" occurrence ON occurrence."employeeId" = schedule."employeeId"
            WHERE schedule."companyId" IN (${Prisma.join(companyIds)}) ${scheduleUnitSql} ${scheduleEmployeeSql} ${scheduleDepartmentSql} ${scheduleTeamSql} ${scheduleShiftSql} ${schedulePositionSql} ${absenceTypeSql}
              AND schedule."status" = 'ATIVA'
              AND occurrence."status" = 'APROVADO' AND occurrence."deletedAt" IS NULL
              AND schedule."startAt" < ${endExclusive} AND schedule."endAt" > ${start}
              AND COALESCE(occurrence."startDate", occurrence."date") < schedule."endAt"
              AND COALESCE(occurrence."endDate", occurrence."startDate", occurrence."date") + INTERVAL '1 day' > schedule."startAt"
            GROUP BY schedule."id", schedule."startAt", schedule."endAt"
          )
          SELECT COALESCE(SUM(LEAST(planned_hours, absent_hours)), 0) AS hours FROM overlap_by_schedule
        `);
        absentScheduledHours = toNumber(absenceHours[0]?.hours);
      }

      return {
        period: { startDate: query.startDate, endDate: query.endDate, timeZone: env.APP_TIMEZONE, inclusive: true },
        employees: {
          active: activeEmployees,
          admitted: admittedEmployees,
          dismissed: dismissedEmployees,
          away: awayEmployees.length,
          byDepartment: employeeDepartments.map((item) => ({ name: item.department, value: item._count._all }))
        },
        epi: {
          registered: totalEpis,
          stockTotal,
          lowStock,
          delivered: delivered._sum.quantity ?? 0,
          returned: returned._sum.quantity ?? 0,
          substituted: substituted._sum.quantity ?? 0,
          expiring: expiringEpis,
          expired: expiredEpis
        },
        costs,
        schedules: { activeNow: schedulesToday, scheduledInPeriod: schedulesToday, hoursPlanned, upcoming: upcomingSchedules },
        occurrences: {
          total: absenceTotal,
          justified: justifiedAbsences,
          notJustified: unjustifiedAbsences,
          medicalCertificates,
          affectedEmployees: absenceEmployees.length,
          absentScheduledHours,
          absenteeismPercent: hoursPlanned > 0 ? (absentScheduledHours / hoursPlanned) * 100 : null
        },
        // Alias temporario para clientes antigos. A interface nova usa "occurrences".
        absences: {
          total: absenceTotal,
          justified: justifiedAbsences,
          notJustified: unjustifiedAbsences,
          medicalCertificates,
          affectedEmployees: absenceEmployees.length,
          absentScheduledHours,
          absenteeismPercent: hoursPlanned > 0 ? (absentScheduledHours / hoursPlanned) * 100 : null
        }
      };
    }
  );
}

const scheduleSummarySelect = {
  id: true,
  startAt: true,
  endAt: true,
  employee: { select: { id: true, name: true, registration: true } },
  team: { select: { id: true, name: true } },
  shift: { select: { id: true, name: true } }
} as const;
