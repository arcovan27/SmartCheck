import type { FastifyInstance } from "fastify";
import { EmployeeOccurrenceType, HrPermission, OccurrenceStatus, Prisma, ScheduleDayType, ScheduleOrigin, SchedulePeriodStatus, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertUnitAccess, hasHrPermission, requireAnyHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { env } from "../env.js";
import { inclusiveStoredCivilDateRange } from "../services/hrSafety.js";
import { calendarDayCount, legacyOccurrenceType, occurrenceFrequencyCodes, occurrenceImpactRange, occurrenceTypePermission, validateOccurrenceBusinessRules } from "../services/occurrenceWorkflow.js";
import { dateKey, dateOnly, startOfCompetence } from "../services/workforceSchedules.js";

const occurrenceFields = z.object({
    employeeId: z.string().cuid(),
    idempotencyKey: z.string().uuid().optional(),
    type: z.nativeEnum(EmployeeOccurrenceType).optional(),
    frequencyCode: z.enum(occurrenceFrequencyCodes).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    hoursAway: z.number().min(0).max(744).optional().nullable(),
    isJustified: z.boolean().optional().nullable(),
    reasonId: z.string().optional().nullable(),
    description: z.string().min(3).max(500),
    notes: z.string().max(2000).optional().nullable(),
    accidentOccurredAt: z.coerce.date().optional().nullable(),
    accidentLocation: z.string().trim().max(300).optional().nullable(),
    hasAccidentLeave: z.boolean().optional().nullable(),
    accidentLeaveStartDate: z.coerce.date().optional().nullable(),
    accidentLeaveEndDate: z.coerce.date().optional().nullable(),
    catNumber: z.string().trim().max(80).optional().nullable()
  });

const occurrenceInput = occurrenceFields
  .refine((value) => Boolean(value.type || value.frequencyCode), { message: "Informe o tipo da ocorrencia", path: ["frequencyCode"] })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "A data final deve ser igual ou posterior a data inicial",
    path: ["endDate"]
  });

function legacyFrequencyCode(type: EmployeeOccurrenceType, isJustified?: boolean | null) {
  if (type === EmployeeOccurrenceType.ATESTADO_MEDICO) return "ATEST";
  if (type === EmployeeOccurrenceType.FALTA) return isJustified ? "FALTA_JUST" : "FALTA_INJ";
  if (type === EmployeeOccurrenceType.FERIAS) return "FERIAS";
  if (type === EmployeeOccurrenceType.AFASTAMENTO) return "AUX_DOENCA";
  if (type === EmployeeOccurrenceType.ADVERTENCIA) return "ADVERT";
  if (type === EmployeeOccurrenceType.SUSPENSAO) return "SUSP";
  if (type === EmployeeOccurrenceType.ACIDENTE_TRABALHO) return "ACID_TRAB";
  return null;
}

function indicatorBucketWhere(bucket?: string): Prisma.EmployeeOccurrenceWhereInput | undefined {
  if (!bucket) return undefined;
  const code = (value: string) => ({ frequencyType: { code: value } });
  switch (bucket) {
    case "MEDICAL_CERTIFICATE": return { OR: [code("ATEST"), { frequencyTypeId: null, type: EmployeeOccurrenceType.ATESTADO_MEDICO }] };
    case "UNJUSTIFIED_ABSENCE": return { OR: [code("FALTA_INJ"), { frequencyTypeId: null, type: EmployeeOccurrenceType.FALTA, isJustified: { not: true } }] };
    case "JUSTIFIED_ABSENCE": return { OR: [code("FALTA_JUST"), { frequencyTypeId: null, type: EmployeeOccurrenceType.FALTA, isJustified: true }] };
    case "WARNING": return { OR: [code("ADVERT"), { frequencyTypeId: null, type: EmployeeOccurrenceType.ADVERTENCIA }] };
    case "SUSPENSION": return { OR: [code("SUSP"), { frequencyTypeId: null, type: EmployeeOccurrenceType.SUSPENSAO }] };
    case "WORK_ACCIDENT": return { OR: [code("ACID_TRAB"), { frequencyTypeId: null, type: EmployeeOccurrenceType.ACIDENTE_TRABALHO }] };
    case "VACATION": return { OR: [code("FERIAS"), { frequencyTypeId: null, type: EmployeeOccurrenceType.FERIAS }] };
    case "LICENSE": return { frequencyType: { OR: [{ code: { startsWith: "LIC_" } }, { code: { in: ["ACOMP_FAMILIAR", "DOENCA_FILHO", "INTERN_FILHO", "INTERN_CONJUGE", "JUST_ELEITORAL"] } }] } };
    case "LEAVE": return { OR: [{ frequencyType: { code: { in: ["AUX_DOENCA", "SERV_MILITAR", "AFAST_JUDICIAL"] } } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.AFASTAMENTO }] };
    default: return undefined;
  }
}

const occurrenceSelect = {
  id: true,
  companyId: true,
  unitId: true,
  employeeId: true,
  type: true,
  teamId: true,
  frequencyTypeId: true,
  startDate: true,
  endDate: true,
  accidentOccurredAt: true,
  accidentLocation: true,
  hasAccidentLeave: true,
  accidentLeaveStartDate: true,
  accidentLeaveEndDate: true,
  catNumber: true,
  date: true,
  hoursAway: true,
  daysAway: true,
  isJustified: true,
  reasonId: true,
  description: true,
  notes: true,
  status: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, name: true, registration: true, department: true, position: true } },
  reason: { select: { id: true, name: true } },
  frequencyType: { select: { id: true, code: true, shortCode: true, name: true, category: true, color: true } },
  registeredBy: { select: { id: true, email: true } },
  reviewedBy: { select: { id: true, email: true } },
  attachments: { where: { deletedAt: null }, select: { id: true, filename: true, mimeType: true, createdAt: true } }
} as const;

function civilDate(value: Date): Date {
  return dateOnly(dateKey(value));
}

type OccurrenceImpactRecord = {
  id: string;
  companyId: string | null;
  unitId: string | null;
  employeeId: string;
  frequencyTypeId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  date: Date;
  hasAccidentLeave: boolean | null;
  accidentLeaveStartDate: Date | null;
  accidentLeaveEndDate: Date | null;
  frequencyType: { code: string } | null;
};

async function occurrenceImpact(db: Prisma.TransactionClient | typeof prisma, occurrence: OccurrenceImpactRecord) {
  const empty = { planned: [] as Array<{ date: string; id: string; unitId: string | null; scheduleDate: Date | null; startAt: Date; plannedMinutes: number | null }>, attendanceConflicts: [] as unknown[], occurrenceConflicts: [] as unknown[], closedCompetences: [] as string[], duplicateScheduleDates: [] as string[] };
  if (!occurrence.companyId || !occurrence.frequencyType) return empty;
  const range = occurrenceImpactRange({
    code: occurrence.frequencyType.code,
    startDate: occurrence.startDate ?? occurrence.date,
    endDate: occurrence.endDate,
    hasAccidentLeave: occurrence.hasAccidentLeave,
    accidentLeaveStartDate: occurrence.accidentLeaveStartDate,
    accidentLeaveEndDate: occurrence.accidentLeaveEndDate
  });
  if (!range) return empty;
  const [schedules, attendanceConflicts, occurrenceConflicts, periods] = await Promise.all([
    db.workSchedule.findMany({
      where: {
        companyId: occurrence.companyId,
        employeeId: occurrence.employeeId,
        status: WorkScheduleStatus.ATIVA,
        dayType: ScheduleDayType.WORK,
        OR: [{ scheduleDate: { gte: range.start, lte: range.end } }, { scheduleDate: null, startAt: { gte: range.start, lte: range.end } }]
      },
      select: { id: true, unitId: true, scheduleDate: true, startAt: true, plannedMinutes: true }
    }),
    db.dailyAttendance.findMany({
      where: { employeeId: occurrence.employeeId, date: { gte: range.start, lte: range.end }, deletedAt: null },
      select: { id: true, date: true, frequencyType: { select: { code: true, name: true } } }
    }),
    db.employeeOccurrence.findMany({
      where: {
        id: { not: occurrence.id }, employeeId: occurrence.employeeId, deletedAt: null,
        status: { notIn: [OccurrenceStatus.REJEITADO, OccurrenceStatus.CANCELADO] },
        NOT: { OR: [{ frequencyType: { code: "ADVERT" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ADVERTENCIA }] },
        AND: [{ OR: [{ startDate: { lte: range.end }, endDate: { gte: range.start } }, { startDate: { gte: range.start, lte: range.end } }] }]
      },
      select: { id: true, startDate: true, endDate: true, type: true, frequencyType: { select: { code: true, name: true } } }
    }),
    db.schedulePeriod.findMany({
      where: {
        companyId: occurrence.companyId, status: SchedulePeriodStatus.CLOSED,
        competence: { gte: startOfCompetence(range.start), lte: startOfCompetence(range.end) },
        OR: [{ unitId: null }, ...(occurrence.unitId ? [{ unitId: occurrence.unitId }] : [])]
      },
      select: { id: true, competence: true }
    })
  ]);
  const scheduleByDate = new Map<string, typeof schedules>();
  for (const schedule of schedules) {
    const key = dateKey(schedule.scheduleDate ?? schedule.startAt);
    scheduleByDate.set(key, [...(scheduleByDate.get(key) ?? []), schedule]);
  }
  return {
    planned: [...scheduleByDate.entries()].filter(([, values]) => values.length === 1).map(([date, values]) => ({ date, ...values[0] })),
    duplicateScheduleDates: [...scheduleByDate.entries()].filter(([, values]) => values.length > 1).map(([date]) => date),
    attendanceConflicts,
    occurrenceConflicts,
    closedCompetences: periods.map((period) => dateKey(period.competence))
  };
}

export async function hrOccurrenceRoutes(app: FastifyInstance) {
  app.get(
    "/hr/occurrences/reasons",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_VIEW, HrPermission.OCCURRENCE_REGISTER)] },
    async (request, reply) => {
      const query = z.object({ employeeId: z.string().cuid(), frequencyCode: z.enum(occurrenceFrequencyCodes) }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      const employee = await prisma.employee.findFirst({ where: { id: query.employeeId, companyId: { in: scope.companyIds } }, select: { companyId: true, unitId: true } });
      if (!employee?.companyId) return reply.code(404).send({ message: "Funcionario nao encontrado" });
      assertUnitAccess(scope, employee.unitId);
      const permission = occurrenceTypePermission(query.frequencyCode);
      if (permission && !(await hasHrPermission(request.user.role, permission.register)) && !(await hasHrPermission(request.user.role, permission.view))) return reply.code(403).send({ message: "Permissao insuficiente para este tipo de ocorrencia" });
      const legacyType = legacyOccurrenceType(query.frequencyCode);
      return prisma.absenceReason.findMany({
        where: {
          companyId: employee.companyId, isActive: true,
          OR: [
            { frequencyType: { code: query.frequencyCode } },
            { frequencyTypeId: null, occurrenceType: legacyType },
            ...(["ADVERT", "SUSP"].includes(query.frequencyCode) ? [{ frequencyTypeId: null, occurrenceType: EmployeeOccurrenceType.OUTRO }] : [])
          ]
        },
        select: { id: true, name: true, occurrenceType: true, frequencyType: { select: { code: true, name: true } } },
        orderBy: { name: "asc" }
      });
    }
  );

  app.get(
    "/hr/occurrences/indicators",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_VIEW, HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const query = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        departmentId: z.string().optional(),
        positionId: z.string().optional(),
        employeeId: z.string().cuid().optional(),
        teamId: z.string().optional(),
        shiftId: z.string().optional(),
        type: z.nativeEnum(EmployeeOccurrenceType).optional(),
        frequencyCode: z.enum(occurrenceFrequencyCodes).optional(),
        bucket: z.enum(["JUSTIFIED_ABSENCE", "UNJUSTIFIED_ABSENCE", "MEDICAL_CERTIFICATE", "LEAVE", "VACATION", "WARNING", "SUSPENSION", "WORK_ACCIDENT", "LICENSE", "OTHER"]).optional(),
        status: z.nativeEnum(OccurrenceStatus).optional()
      }).parse(request.query);
      let range: ReturnType<typeof inclusiveStoredCivilDateRange>;
      try {
        range = inclusiveStoredCivilDateRange(query.startDate, query.endDate, env.APP_TIMEZONE);
      } catch (error) {
        return reply.code(400).send({ message: error instanceof Error ? error.message : "Periodo invalido" });
      }
      const scope = await resolveHrDataScope(request);
      const companyIds = query.companyId ? [query.companyId] : scope.companyIds;
      if (query.companyId && !scope.companyIds.includes(query.companyId)) return reply.code(403).send({ message: "Empresa fora do escopo autorizado" });
      if (query.unitId && !scope.allUnitsInCompanies && !scope.unitIds.includes(query.unitId)) return reply.code(403).send({ message: "Unidade fora do escopo autorizado" });
      const scopedUnitIds = query.unitId ? [query.unitId] : scope.allUnitsInCompanies ? null : scope.unitIds;
      const requestedPermission = query.frequencyCode ? occurrenceTypePermission(query.frequencyCode) : null;
      if (requestedPermission && !(await hasHrPermission(request.user.role, requestedPermission.view))) return reply.code(403).send({ message: "Permissao insuficiente para visualizar este tipo de ocorrencia" });
      const hiddenCodes: string[] = [];
      for (const code of ["ADVERT", "SUSP", "ACID_TRAB"] as const) {
        const permission = occurrenceTypePermission(code);
        if (permission && !(await hasHrPermission(request.user.role, permission.view))) hiddenCodes.push(code);
      }
      const { start, endExclusive } = range;
      const where: Prisma.EmployeeOccurrenceWhereInput = {
        companyId: { in: companyIds },
        unitId: scopedUnitIds ? { in: scopedUnitIds } : undefined,
        employeeId: query.employeeId,
        type: query.type,
        deletedAt: query.status === OccurrenceStatus.CANCELADO ? { not: null } : null,
        status: query.status ?? { in: [OccurrenceStatus.PENDENTE, OccurrenceStatus.EM_ANALISE, OccurrenceStatus.APROVADO] },
        frequencyType: query.frequencyCode ? { code: query.frequencyCode } : undefined,
        employee: { positionId: query.positionId },
        AND: [
          {
            OR: [
              { startDate: { gte: start, lt: endExclusive } },
              { startDate: { lt: start }, endDate: { gte: start } },
              { startDate: null, date: { gte: start, lt: endExclusive } }
            ]
          },
          ...(indicatorBucketWhere(query.bucket) ? [indicatorBucketWhere(query.bucket)!] : []),
          ...(hiddenCodes.includes("ADVERT") ? [{ NOT: { OR: [{ frequencyType: { code: "ADVERT" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ADVERTENCIA }] } }] : []),
          ...(hiddenCodes.includes("SUSP") ? [{ NOT: { OR: [{ frequencyType: { code: "SUSP" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.SUSPENSAO }] } }] : []),
          ...(hiddenCodes.includes("ACID_TRAB") ? [{ NOT: { OR: [{ frequencyType: { code: "ACID_TRAB" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ACIDENTE_TRABALHO }] } }] : []),
          ...(query.teamId ? [{ OR: [{ teamId: query.teamId }, { teamId: null, employee: { teamId: query.teamId } }] }] : []),
          ...(query.shiftId ? [{ dailyAttendances: { some: { deletedAt: null, workSchedule: { shiftId: query.shiftId } } } }] : []),
          ...(query.departmentId ? [{
            OR: [
              { departmentId: query.departmentId },
              { departmentId: null, employee: { departmentId: query.departmentId } }
            ]
          }] : [])
        ]
      };

      const companySql = Prisma.sql`o."companyId" IN (${Prisma.join(companyIds)})`;
      const unitSql = scopedUnitIds ? Prisma.sql`AND o."unitId" IN (${Prisma.join(scopedUnitIds)})` : Prisma.empty;
      const employeeSql = query.employeeId ? Prisma.sql`AND o."employeeId" = ${query.employeeId}` : Prisma.empty;
      const departmentSql = query.departmentId ? Prisma.sql`AND COALESCE(o."departmentId", e."departmentId") = ${query.departmentId}` : Prisma.empty;
      const positionSql = query.positionId ? Prisma.sql`AND e."positionId" = ${query.positionId}` : Prisma.empty;
      const teamSql = query.teamId ? Prisma.sql`AND COALESCE(o."teamId", e."teamId") = ${query.teamId}` : Prisma.empty;
      const shiftSql = query.shiftId ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "DailyAttendance" shift_attendance
        JOIN "WorkSchedule" shift_schedule ON shift_schedule."id" = shift_attendance."workScheduleId"
        WHERE shift_attendance."occurrenceId" = o."id" AND shift_attendance."deletedAt" IS NULL AND shift_schedule."shiftId" = ${query.shiftId}
      )` : Prisma.empty;
      const typeSql = query.type ? Prisma.sql`AND o."type" = ${query.type}::"EmployeeOccurrenceType"` : Prisma.empty;
      const frequencyCodeSql = query.frequencyCode ? Prisma.sql`AND COALESCE(occurrence_frequency."code", attendance_frequency."code") = ${query.frequencyCode}` : Prisma.empty;
      const statusSql = query.status ? Prisma.sql`AND o."status" = ${query.status}::"OccurrenceStatus"` : Prisma.sql`AND o."status" IN ('PENDENTE', 'EM_ANALISE', 'APROVADO')`;
      const deletedSql = query.status === OccurrenceStatus.CANCELADO ? Prisma.sql`AND o."deletedAt" IS NOT NULL` : Prisma.sql`AND o."deletedAt" IS NULL`;
      const hiddenCodeSql = hiddenCodes.length ? Prisma.sql`AND COALESCE(occurrence_frequency."code", attendance_frequency."code", '') NOT IN (${Prisma.join(hiddenCodes)})` : Prisma.empty;
      const hiddenLegacySql = hiddenCodes.includes("ADVERT") ? Prisma.sql`AND NOT (o."frequencyTypeId" IS NULL AND o."type" = 'ADVERTENCIA')` : Prisma.empty;
      const hiddenSuspensionLegacySql = hiddenCodes.includes("SUSP") ? Prisma.sql`AND NOT (o."frequencyTypeId" IS NULL AND o."type" = 'SUSPENSAO')` : Prisma.empty;
      const hiddenAccidentLegacySql = hiddenCodes.includes("ACID_TRAB") ? Prisma.sql`AND NOT (o."frequencyTypeId" IS NULL AND o."type" = 'ACIDENTE_TRABALHO')` : Prisma.empty;
      const bucketSql = query.bucket ? Prisma.sql`AND bucket = ${query.bucket}` : Prisma.empty;
      type IndicatorAggregate = {
        total: number;
        affectedEmployees: number;
        totalDays: unknown;
        warnings: number;
        suspensions: number;
        suspensionDays: unknown;
        workAccidents: number;
        workAccidentsWithLeave: number;
        workAccidentsWithoutLeave: number;
        workAccidentLeaveDays: unknown;
        byType: Array<{ key: string; value: number }>;
        evolution: Array<{ date: string; value: number }>;
        byDepartment: Array<{ name: string; value: number }>;
        byUnit: Array<{ name: string; value: number }>;
      };
      const aggregateRows = await prisma.$queryRaw<IndicatorAggregate[]>(Prisma.sql`
        WITH classified AS (
          SELECT
            o."id",
            o."employeeId" AS employee_id,
            COALESCE(o."daysAway", GREATEST(1, (COALESCE(o."endDate", o."startDate", o."date")::date - COALESCE(o."startDate", o."date")::date) + 1)) AS days,
            CASE WHEN o."hasAccidentLeave" = true THEN GREATEST(1, (COALESCE(o."accidentLeaveEndDate", o."accidentLeaveStartDate")::date - o."accidentLeaveStartDate"::date) + 1) ELSE 0 END AS accident_leave_days,
            COALESCE(o."hasAccidentLeave", false) AS has_accident_leave,
            COALESCE(o."startDate", o."date") AS occurred_at,
            COALESCE(o."departmentNameSnapshot", department."name", e."department", 'Sem setor') AS department_name,
            COALESCE(unit."name", 'Sem unidade') AS unit_name,
            CASE
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'ATEST' OR o."type" = 'ATESTADO_MEDICO' THEN 'MEDICAL_CERTIFICATE'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'FALTA_INJ' OR (o."type" = 'FALTA' AND COALESCE(o."isJustified", false) = false) THEN 'UNJUSTIFIED_ABSENCE'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'FALTA_JUST' OR (o."type" = 'FALTA' AND o."isJustified" = true) THEN 'JUSTIFIED_ABSENCE'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'ADVERT' OR o."type" = 'ADVERTENCIA' THEN 'WARNING'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'SUSP' OR o."type" = 'SUSPENSAO' THEN 'SUSPENSION'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'ACID_TRAB' OR o."type" = 'ACIDENTE_TRABALHO' THEN 'WORK_ACCIDENT'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") = 'FERIAS' OR o."type" = 'FERIAS' THEN 'VACATION'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") LIKE 'LIC_%' OR COALESCE(occurrence_frequency."code", attendance_frequency."code") IN ('ACOMP_FAMILIAR','DOENCA_FILHO','INTERN_FILHO','INTERN_CONJUGE','JUST_ELEITORAL') THEN 'LICENSE'
              WHEN COALESCE(occurrence_frequency."code", attendance_frequency."code") IN ('AUX_DOENCA','SERV_MILITAR','AFAST_JUDICIAL') OR o."type" = 'AFASTAMENTO' THEN 'LEAVE'
              ELSE 'OTHER'
            END AS bucket
          FROM "EmployeeOccurrence" o
          JOIN "Employee" e ON e."id" = o."employeeId"
          LEFT JOIN "Department" department ON department."id" = COALESCE(o."departmentId", e."departmentId")
          LEFT JOIN "Unit" unit ON unit."id" = o."unitId"
          LEFT JOIN "FrequencyType" occurrence_frequency ON occurrence_frequency."id" = o."frequencyTypeId"
          LEFT JOIN LATERAL (
            SELECT frequency_type."code"
            FROM "DailyAttendance" attendance
            JOIN "FrequencyType" frequency_type ON frequency_type."id" = attendance."frequencyTypeId"
            WHERE attendance."occurrenceId" = o."id" AND attendance."deletedAt" IS NULL
            ORDER BY attendance."createdAt" ASC
            LIMIT 1
          ) attendance_frequency ON true
          WHERE ${companySql} ${unitSql} ${employeeSql} ${departmentSql} ${positionSql} ${teamSql} ${shiftSql} ${typeSql} ${frequencyCodeSql} ${hiddenCodeSql} ${hiddenLegacySql} ${hiddenSuspensionLegacySql} ${hiddenAccidentLegacySql}
            ${deletedSql}
            ${statusSql}
            AND (
              (o."startDate" >= ${start} AND o."startDate" < ${endExclusive})
              OR (o."startDate" < ${start} AND o."endDate" >= ${start})
              OR (o."startDate" IS NULL AND o."date" >= ${start} AND o."date" < ${endExclusive})
            )
        ), base AS (
          SELECT * FROM classified WHERE true ${bucketSql}
        )
        SELECT
          (SELECT COUNT(*)::int FROM base) AS total,
          (SELECT COUNT(DISTINCT employee_id)::int FROM base) AS "affectedEmployees",
          (SELECT COALESCE(SUM(days), 0) FROM base) AS "totalDays",
          (SELECT COUNT(*)::int FROM base WHERE bucket = 'WARNING') AS warnings,
          (SELECT COUNT(*)::int FROM base WHERE bucket = 'SUSPENSION') AS suspensions,
          (SELECT COALESCE(SUM(days), 0) FROM base WHERE bucket = 'SUSPENSION') AS "suspensionDays",
          (SELECT COUNT(*)::int FROM base WHERE bucket = 'WORK_ACCIDENT') AS "workAccidents",
          (SELECT COUNT(*)::int FROM base WHERE bucket = 'WORK_ACCIDENT' AND has_accident_leave) AS "workAccidentsWithLeave",
          (SELECT COUNT(*)::int FROM base WHERE bucket = 'WORK_ACCIDENT' AND NOT has_accident_leave) AS "workAccidentsWithoutLeave",
          (SELECT COALESCE(SUM(accident_leave_days), 0) FROM base WHERE bucket = 'WORK_ACCIDENT') AS "workAccidentLeaveDays",
          (SELECT COALESCE(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) FROM (SELECT bucket AS key, COUNT(*)::int AS value FROM base GROUP BY bucket ORDER BY value DESC) grouped) AS "byType",
          (SELECT COALESCE(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) FROM (SELECT occurred_at::date::text AS date, COUNT(*)::int AS value FROM base GROUP BY occurred_at::date ORDER BY occurred_at::date) grouped) AS evolution,
          (SELECT COALESCE(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) FROM (SELECT department_name AS name, COUNT(*)::int AS value FROM base GROUP BY department_name ORDER BY value DESC LIMIT 12) grouped) AS "byDepartment",
          (SELECT COALESCE(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) FROM (SELECT unit_name AS name, COUNT(*)::int AS value FROM base GROUP BY unit_name ORDER BY value DESC LIMIT 12) grouped) AS "byUnit"
      `);
      const [items, total] = await prisma.$transaction([
        prisma.employeeOccurrence.findMany({
          where,
          select: {
            id: true, type: true, startDate: true, endDate: true, date: true, daysAway: true, hoursAway: true,
            isJustified: true, status: true, companyId: true, unitId: true, departmentNameSnapshot: true,
            description: true, notes: true, reasonId: true, accidentOccurredAt: true, accidentLocation: true,
            hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true, catNumber: true,
            frequencyType: { select: { code: true, shortCode: true, name: true, category: true, color: true } },
            employee: {
              select: {
                id: true, name: true, registration: true, department: true,
                company: { select: { legalName: true, tradeName: true } },
                unitRef: { select: { name: true } },
                departmentRef: { select: { name: true, deletedAt: true } }
              }
            },
            registeredBy: { select: { id: true, email: true } },
            dailyAttendances: { where: { deletedAt: null }, select: { frequencyType: { select: { code: true, name: true, category: true, color: true } } }, take: 1 }
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.employeeOccurrence.count({ where })
      ]);
      const aggregate = aggregateRows[0] ?? { total: 0, affectedEmployees: 0, totalDays: 0, warnings: 0, suspensions: 0, suspensionDays: 0, workAccidents: 0, workAccidentsWithLeave: 0, workAccidentsWithoutLeave: 0, workAccidentLeaveDays: 0, byType: [], evolution: [], byDepartment: [], byUnit: [] };
      return {
        period: { startDate: query.startDate, endDate: query.endDate, inclusive: true, timeZone: env.APP_TIMEZONE },
        filters: query,
        aggregate: { ...aggregate, totalDays: Number(aggregate.totalDays), suspensionDays: Number(aggregate.suspensionDays), workAccidentLeaveDays: Number(aggregate.workAccidentLeaveDays) },
        items,
        total,
        page: query.page,
        pageSize: query.pageSize
      };
    }
  );

  app.get(
    "/hr/occurrences",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_VIEW, HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          employeeId: z.string().cuid().optional(),
          unitId: z.string().optional(),
          type: z.nativeEnum(EmployeeOccurrenceType).optional(),
          frequencyCode: z.enum(occurrenceFrequencyCodes).optional(),
          status: z.nativeEnum(OccurrenceStatus).optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional()
        })
        .parse(request.query);
      const scope = await resolveHrDataScope(request);
      const typePermission = query.frequencyCode ? occurrenceTypePermission(query.frequencyCode) : null;
      if (typePermission && !(await hasHrPermission(request.user.role, typePermission.view))) return reply.code(403).send({ message: "Permissao insuficiente para visualizar este tipo de ocorrencia" });
      const hiddenCodes: string[] = [];
      for (const code of ["ADVERT", "SUSP", "ACID_TRAB"] as const) {
        const permission = occurrenceTypePermission(code);
        if (permission && !(await hasHrPermission(request.user.role, permission.view))) hiddenCodes.push(code);
      }
      const where = {
        deletedAt: query.status === OccurrenceStatus.CANCELADO ? { not: null } : null,
        companyId: { in: scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        employeeId: query.employeeId,
        type: query.type,
        frequencyType: query.frequencyCode ? { code: query.frequencyCode } : undefined,
        status: query.status,
        startDate: query.startDate || query.endDate ? { gte: query.startDate, lte: query.endDate } : undefined,
        AND: [
          ...(hiddenCodes.includes("ADVERT") ? [{ NOT: { OR: [{ frequencyType: { code: "ADVERT" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ADVERTENCIA }] } }] : []),
          ...(hiddenCodes.includes("SUSP") ? [{ NOT: { OR: [{ frequencyType: { code: "SUSP" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.SUSPENSAO }] } }] : []),
          ...(hiddenCodes.includes("ACID_TRAB") ? [{ NOT: { OR: [{ frequencyType: { code: "ACID_TRAB" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ACIDENTE_TRABALHO }] } }] : [])
        ]
      };
      const [items, total] = await prisma.$transaction([
        prisma.employeeOccurrence.findMany({
          where,
          select: occurrenceSelect,
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.employeeOccurrence.count({ where })
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
  );

  app.post(
    "/hr/occurrences",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_EDIT, HrPermission.OCCURRENCE_REGISTER)] },
    async (request, reply) => {
      const body = occurrenceInput.parse(request.body);
      const scope = await resolveHrDataScope(request);
      const employee = await prisma.employee.findFirst({
        where: { id: body.employeeId, companyId: { in: scope.companyIds } },
        select: { id: true, companyId: true, unitId: true, departmentId: true, teamId: true, department: true, departmentRef: { select: { name: true } } }
      });
      if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });
      if (!employee.companyId) return reply.code(409).send({ message: "Funcionario sem empresa definida" });
      assertUnitAccess(scope, employee.unitId);

      body.startDate = civilDate(body.startDate);
      body.endDate = body.endDate ? civilDate(body.endDate) : body.startDate;
      body.accidentLeaveStartDate = body.accidentLeaveStartDate ? civilDate(body.accidentLeaveStartDate) : body.accidentLeaveStartDate;
      body.accidentLeaveEndDate = body.accidentLeaveEndDate ? civilDate(body.accidentLeaveEndDate) : body.accidentLeaveEndDate;
      if (body.idempotencyKey) {
        const replay = await prisma.employeeOccurrence.findFirst({
          where: { companyId: employee.companyId, idempotencyKey: body.idempotencyKey },
          select: occurrenceSelect
        });
        if (replay) return reply.code(200).send({ ...replay, idempotentReplay: true });
      }

      const requestedCode = body.frequencyCode ?? (body.type ? legacyFrequencyCode(body.type, body.isJustified) : null);
      const frequencyType = requestedCode && requestedCode !== "OUTRO" ? await prisma.frequencyType.findFirst({
        where: { companyId: employee.companyId, code: requestedCode, isActive: true }
      }) : null;
      if (requestedCode && requestedCode !== "OUTRO" && !frequencyType) return reply.code(400).send({ message: "Tipo de ocorrencia inexistente ou inativo para a empresa" });
      if (requestedCode) {
        const permission = occurrenceTypePermission(requestedCode);
        if (permission && !(await hasHrPermission(request.user.role, permission.register))) return reply.code(403).send({ message: "Permissao insuficiente para registrar este tipo de ocorrencia" });
      }
      const businessErrors = validateOccurrenceBusinessRules({
        code: requestedCode ?? "OTHER", startDate: body.startDate, endDate: body.endDate, reasonId: body.reasonId,
        accidentOccurredAt: body.accidentOccurredAt, accidentLocation: body.accidentLocation,
        hasAccidentLeave: body.hasAccidentLeave, accidentLeaveStartDate: body.accidentLeaveStartDate,
        accidentLeaveEndDate: body.accidentLeaveEndDate
      });
      if (businessErrors.length) return reply.code(400).send({ message: businessErrors[0], errors: businessErrors });

      if (body.reasonId) {
        const reason = await prisma.absenceReason.findFirst({
          where: {
            id: body.reasonId, companyId: employee.companyId, isActive: true,
            OR: [
              ...(frequencyType ? [{ frequencyTypeId: frequencyType.id }] : []),
              { frequencyTypeId: null, occurrenceType: body.type ?? (requestedCode ? legacyOccurrenceType(requestedCode) : EmployeeOccurrenceType.OUTRO) },
              ...(["ADVERT", "SUSP"].includes(requestedCode ?? "") ? [{ frequencyTypeId: null, occurrenceType: EmployeeOccurrenceType.OUTRO }] : [])
            ]
          },
          select: { id: true }
        });
        if (!reason) return reply.code(400).send({ message: "Motivo invalido para o tipo de ocorrencia" });
      }

      let idempotentReplay = false;
      const created = await prisma.$transaction(async (tx) => {
        const occurrence = await tx.employeeOccurrence.create({
          data: {
            employeeId: employee.id,
            companyId: employee.companyId,
            unitId: employee.unitId,
            departmentId: employee.departmentId,
            departmentNameSnapshot: employee.departmentRef?.name ?? employee.department,
            teamId: employee.teamId,
            frequencyTypeId: frequencyType?.id,
            type: body.type ?? (requestedCode ? legacyOccurrenceType(requestedCode) : EmployeeOccurrenceType.OUTRO),
            date: body.startDate,
            startDate: body.startDate,
            endDate: body.endDate ?? body.startDate,
            hoursAway: body.hoursAway,
            daysAway: requestedCode === "ACID_TRAB" && body.hasAccidentLeave && body.accidentLeaveStartDate
              ? calendarDayCount(body.accidentLeaveStartDate, body.accidentLeaveEndDate)
              : calendarDayCount(body.startDate, body.endDate),
            isJustified: body.isJustified,
            reasonId: body.reasonId,
            description: body.description,
            notes: body.notes,
            accidentOccurredAt: body.accidentOccurredAt,
            accidentLocation: body.accidentLocation,
            hasAccidentLeave: requestedCode === "ACID_TRAB" ? Boolean(body.hasAccidentLeave) : null,
            accidentLeaveStartDate: body.accidentLeaveStartDate,
            accidentLeaveEndDate: body.accidentLeaveEndDate,
            catNumber: body.catNumber,
            status: OccurrenceStatus.PENDENTE,
            idempotencyKey: body.idempotencyKey,
            registeredById: request.user.id
          },
          select: occurrenceSelect
        });
        await writeAudit(tx, request, {
          companyId: employee.companyId,
          unitId: employee.unitId,
          action: "OCCURRENCE_CREATE",
          entityType: "EmployeeOccurrence",
          entityId: occurrence.id,
          newValue: occurrence
        });
        return occurrence;
      }).catch(async (error) => {
        if (body.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const replay = await prisma.employeeOccurrence.findFirst({
            where: { companyId: employee.companyId!, idempotencyKey: body.idempotencyKey },
            select: occurrenceSelect
          });
          if (replay) {
            idempotentReplay = true;
            return replay;
          }
        }
        throw error;
      });
      const impactPreview = await occurrenceImpact(prisma, created);
      return reply.code(idempotentReplay ? 200 : 201).send({ ...created, impactPreview, idempotentReplay });
    }
  );

  app.patch(
    "/hr/occurrences/:id",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_EDIT, HrPermission.OCCURRENCE_REGISTER)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = occurrenceFields.omit({ employeeId: true, idempotencyKey: true }).partial().parse(request.body);
      if (body.startDate) body.startDate = civilDate(body.startDate);
      if (body.endDate) body.endDate = civilDate(body.endDate);
      if (body.accidentLeaveStartDate) body.accidentLeaveStartDate = civilDate(body.accidentLeaveStartDate);
      if (body.accidentLeaveEndDate) body.accidentLeaveEndDate = civilDate(body.accidentLeaveEndDate);
      const scope = await resolveHrDataScope(request);
      const existing = await prisma.employeeOccurrence.findFirst({
        where: { id: params.id, deletedAt: null, companyId: { in: scope.companyIds } },
        select: occurrenceSelect
      });
      if (!existing) return reply.code(404).send({ message: "Ocorrencia nao encontrada" });
      assertUnitAccess(scope, existing.unitId);
      if (existing.status !== OccurrenceStatus.PENDENTE && existing.status !== OccurrenceStatus.EM_ANALISE) {
        return reply.code(409).send({ message: "Somente ocorrencias pendentes ou em analise podem ser editadas" });
      }

      const nextStart = body.startDate ?? existing.startDate ?? existing.date;
      const nextEnd = body.endDate === undefined ? existing.endDate : body.endDate;
      if (nextEnd && nextEnd < nextStart) return reply.code(400).send({ message: "Periodo de ocorrencia invalido" });
      const requestedCode = body.frequencyCode ?? (body.type ? legacyFrequencyCode(body.type, body.isJustified) : existing.frequencyType?.code);
      const frequencyType = requestedCode && requestedCode !== "OUTRO" && existing.companyId ? await prisma.frequencyType.findFirst({ where: { companyId: existing.companyId, code: requestedCode, isActive: true } }) : null;
      if (requestedCode && requestedCode !== "OUTRO" && !frequencyType) return reply.code(400).send({ message: "Tipo de ocorrencia inexistente ou inativo para a empresa" });
      if (requestedCode) {
        const permission = occurrenceTypePermission(requestedCode);
        if (permission && !(await hasHrPermission(request.user.role, permission.register))) return reply.code(403).send({ message: "Permissao insuficiente para editar este tipo de ocorrencia" });
      }
      const businessErrors = validateOccurrenceBusinessRules({
        code: requestedCode ?? "OTHER", startDate: nextStart, endDate: nextEnd, reasonId: body.reasonId === undefined ? existing.reasonId : body.reasonId,
        accidentOccurredAt: body.accidentOccurredAt === undefined ? existing.accidentOccurredAt : body.accidentOccurredAt,
        accidentLocation: body.accidentLocation === undefined ? existing.accidentLocation : body.accidentLocation,
        hasAccidentLeave: body.hasAccidentLeave === undefined ? existing.hasAccidentLeave : body.hasAccidentLeave,
        accidentLeaveStartDate: body.accidentLeaveStartDate === undefined ? existing.accidentLeaveStartDate : body.accidentLeaveStartDate,
        accidentLeaveEndDate: body.accidentLeaveEndDate === undefined ? existing.accidentLeaveEndDate : body.accidentLeaveEndDate
      });
      if (businessErrors.length) return reply.code(400).send({ message: businessErrors[0], errors: businessErrors });

      const updated = await prisma.$transaction(async (tx) => {
        const occurrence = await tx.employeeOccurrence.update({
          where: { id: existing.id },
          data: {
            type: body.type ?? (body.frequencyCode ? legacyOccurrenceType(body.frequencyCode) : undefined),
            frequencyTypeId: frequencyType?.id,
            date: body.startDate,
            startDate: body.startDate,
            endDate: body.endDate,
            hoursAway: body.hoursAway,
            daysAway: body.startDate || body.endDate !== undefined || body.accidentLeaveStartDate !== undefined || body.accidentLeaveEndDate !== undefined
              ? (requestedCode === "ACID_TRAB" && (body.hasAccidentLeave ?? existing.hasAccidentLeave) && (body.accidentLeaveStartDate ?? existing.accidentLeaveStartDate)
                ? calendarDayCount((body.accidentLeaveStartDate ?? existing.accidentLeaveStartDate)!, body.accidentLeaveEndDate === undefined ? existing.accidentLeaveEndDate : body.accidentLeaveEndDate)
                : calendarDayCount(nextStart, nextEnd))
              : undefined,
            isJustified: body.isJustified,
            reasonId: body.reasonId,
            description: body.description,
            notes: body.notes
            ,accidentOccurredAt: body.accidentOccurredAt
            ,accidentLocation: body.accidentLocation
            ,hasAccidentLeave: body.hasAccidentLeave
            ,accidentLeaveStartDate: body.accidentLeaveStartDate
            ,accidentLeaveEndDate: body.accidentLeaveEndDate
            ,catNumber: body.catNumber
          },
          select: occurrenceSelect
        });
        await writeAudit(tx, request, {
          companyId: existing.companyId,
          unitId: existing.unitId,
          action: "OCCURRENCE_UPDATE",
          entityType: "EmployeeOccurrence",
          entityId: existing.id,
          previousValue: existing,
          newValue: occurrence
        });
        return occurrence;
      });
      return updated;
    }
  );

  app.get(
    "/hr/occurrences/:id/impact",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_VIEW, HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const occurrence = await prisma.employeeOccurrence.findFirst({
        where: { id: params.id, deletedAt: null, companyId: { in: scope.companyIds } },
        select: {
          id: true, companyId: true, unitId: true, employeeId: true, frequencyTypeId: true, startDate: true, endDate: true,
          date: true, hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true,
          frequencyType: { select: { code: true } }
        }
      });
      if (!occurrence) return reply.code(404).send({ message: "Ocorrencia nao encontrada" });
      assertUnitAccess(scope, occurrence.unitId);
      const permission = occurrence.frequencyType ? occurrenceTypePermission(occurrence.frequencyType.code) : null;
      if (permission && !(await hasHrPermission(request.user.role, permission.view))) return reply.code(403).send({ message: "Permissao insuficiente para visualizar este tipo de ocorrencia" });
      return occurrenceImpact(prisma, occurrence);
    }
  );

  app.post(
    "/hr/occurrences/:id/review",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = z.object({ status: z.enum([OccurrenceStatus.EM_ANALISE, OccurrenceStatus.APROVADO, OccurrenceStatus.REJEITADO]), reviewNote: z.string().max(1000).optional() }).parse(request.body);
      const scope = await resolveHrDataScope(request);
      const existing = await prisma.employeeOccurrence.findFirst({
        where: { id: params.id, deletedAt: null, companyId: { in: scope.companyIds } },
        select: {
          id: true, companyId: true, unitId: true, employeeId: true, frequencyTypeId: true, startDate: true, endDate: true,
          date: true, status: true, hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true,
          frequencyType: { select: { code: true, requiresDocument: true } },
          attachments: { where: { deletedAt: null }, select: { id: true } }
        }
      });
      if (!existing) return reply.code(404).send({ message: "Ocorrencia nao encontrada" });
      assertUnitAccess(scope, existing.unitId);

      if (body.status === OccurrenceStatus.APROVADO && existing.frequencyType?.requiresDocument && existing.attachments.length === 0) {
        return reply.code(400).send({ message: "Nao e possivel aprovar sem o documento obrigatorio" });
      }
      const permission = existing.frequencyType ? occurrenceTypePermission(existing.frequencyType.code) : null;
      if (permission && !(await hasHrPermission(request.user.role, permission.view))) return reply.code(403).send({ message: "Permissao insuficiente para analisar este tipo de ocorrencia" });

      try {
      const occurrence = await prisma.$transaction(async (tx) => {
        const locked = await tx.employeeOccurrence.findFirst({
          where: { id: existing.id, deletedAt: null },
          select: {
            id: true, companyId: true, unitId: true, employeeId: true, frequencyTypeId: true, startDate: true, endDate: true,
            date: true, status: true, hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true,
            frequencyType: { select: { code: true } }
          }
        });
        if (!locked || (locked.status !== OccurrenceStatus.PENDENTE && locked.status !== OccurrenceStatus.EM_ANALISE)) throw new Error("OCCURRENCE_STATE_CHANGED");
        if (body.status === OccurrenceStatus.APROVADO && locked.frequencyType) {
          const impact = await occurrenceImpact(tx, locked);
          if (impact.closedCompetences.length || impact.attendanceConflicts.length || impact.occurrenceConflicts.length || impact.duplicateScheduleDates.length) {
            const error = new Error("OCCURRENCE_IMPACT_CONFLICT");
            Object.assign(error, { impact });
            throw error;
          }
          for (const planned of impact.planned) {
            await tx.dailyAttendance.create({
              data: {
                companyId: locked.companyId!, unitId: planned.unitId ?? locked.unitId, employeeId: locked.employeeId,
                date: dateOnly(planned.date), workScheduleId: planned.id, frequencyTypeId: locked.frequencyTypeId!, occurrenceId: locked.id,
                hours: planned.plannedMinutes ? new Prisma.Decimal(planned.plannedMinutes / 60) : null,
                days: new Prisma.Decimal(1), status: OccurrenceStatus.APROVADO, origin: ScheduleOrigin.MANUAL,
                createdById: request.user.id, approvedById: request.user.id, approvedAt: new Date()
              }
            });
          }
        }
        const updated = await tx.employeeOccurrence.update({
          where: { id: existing.id },
          data: { status: body.status, reviewedById: request.user.id, reviewedAt: new Date() },
          select: occurrenceSelect
        });
        await writeAudit(tx, request, {
          companyId: existing.companyId,
          unitId: existing.unitId,
          action: `OCCURRENCE_${body.status}`,
          entityType: "EmployeeOccurrence",
          entityId: existing.id,
          previousValue: { status: existing.status },
          newValue: { status: body.status },
          metadata: { reviewNote: body.reviewNote, materializedFrequencyCode: locked.frequencyType?.code }
        });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return occurrence;
      } catch (error) {
        if (error instanceof Error && error.message === "OCCURRENCE_STATE_CHANGED") return reply.code(409).send({ message: "A ocorrencia foi alterada por outro usuario; atualize a tela" });
        if (error instanceof Error && error.message === "OCCURRENCE_IMPACT_CONFLICT") return reply.code(409).send({ message: "A ocorrencia possui conflitos e nao pode ser aprovada", impact: (error as Error & { impact?: unknown }).impact });
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return reply.code(409).send({ message: "Ja existe apontamento realizado para uma das datas" });
        throw error;
      }
    }
  );

  app.delete(
    "/hr/occurrences/:id",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_CANCEL, HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const existing = await prisma.employeeOccurrence.findFirst({
        where: { id: params.id, deletedAt: null, companyId: { in: scope.companyIds } },
        select: { id: true, companyId: true, unitId: true, status: true, frequencyType: { select: { code: true } } }
      });
      if (!existing) return reply.code(404).send({ message: "Ocorrencia nao encontrada" });
      assertUnitAccess(scope, existing.unitId);
      const permission = existing.frequencyType ? occurrenceTypePermission(existing.frequencyType.code) : null;
      if (permission && !(await hasHrPermission(request.user.role, permission.view))) return reply.code(403).send({ message: "Permissao insuficiente para cancelar este tipo de ocorrencia" });
      await prisma.$transaction(async (tx) => {
        await tx.employeeOccurrence.update({
          where: { id: existing.id },
          data: { status: OccurrenceStatus.CANCELADO, deletedAt: new Date(), reviewedById: request.user.id, reviewedAt: new Date() }
        });
        const removedAttendances = await tx.dailyAttendance.updateMany({
          where: { occurrenceId: existing.id, deletedAt: null },
          data: { deletedAt: new Date(), updatedById: request.user.id, status: OccurrenceStatus.CANCELADO }
        });
        await writeAudit(tx, request, {
          companyId: existing.companyId,
          unitId: existing.unitId,
          action: "OCCURRENCE_CANCEL",
          entityType: "EmployeeOccurrence",
          entityId: existing.id,
          previousValue: { status: existing.status },
          newValue: { status: OccurrenceStatus.CANCELADO },
          metadata: { logicallyRemovedAttendances: removedAttendances.count }
        });
      });
      return reply.send({ message: "Ocorrencia cancelada com sucesso" });
    }
  );
}
