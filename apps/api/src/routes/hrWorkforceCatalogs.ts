import type { FastifyInstance } from "fastify";
import { FrequencyCategory, HolidayScope, HrPermission, ScheduleDayType, SchedulePatternType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, requireAnyHrPermission, requireHrPermission, resolveHrDataScope } from "../services/hrAccess.js";
import { plannedMinutes, startOfCompetence, endOfCompetence } from "../services/workforceSchedules.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";
import { requireWorkScheduleEnabled } from "../services/hrFeatureGuards.js";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const shiftInput = z.object({
  companyId: z.string(),
  name: z.string().min(2).max(120),
  code: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  breakMinutes: z.number().int().min(0).max(720).default(0),
  crossesMidnight: z.boolean().default(false),
  color: colorSchema.default("#2563eb"),
  isActive: z.boolean().default(true)
});

const patternDayInput = z.object({
  cyclePosition: z.number().int().min(1).max(366),
  dayType: z.nativeEnum(ScheduleDayType),
  shiftId: z.string().optional().nullable(),
  startMinute: z.number().int().min(0).max(1439).optional().nullable(),
  endMinute: z.number().int().min(0).max(1439).optional().nullable(),
  breakMinutes: z.number().int().min(0).max(720).optional(),
  crossesMidnight: z.boolean().default(false)
});

const patternInput = z.object({
  companyId: z.string(),
  name: z.string().min(2).max(120),
  code: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  description: z.string().max(1000).optional().nullable(),
  patternType: z.nativeEnum(SchedulePatternType),
  cycleDays: z.number().int().min(1).max(366),
  isActive: z.boolean().default(true),
  days: z.array(patternDayInput).min(1).max(366)
});

const frequencyBaseInput = z.object({
  companyId: z.string(),
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  shortCode: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  name: z.string().min(2).max(120),
  category: z.nativeEnum(FrequencyCategory),
  color: colorSchema,
  icon: z.string().max(40).optional().nullable(),
  countsAsPresence: z.boolean().default(false),
  countsAsAbsence: z.boolean().default(false),
  justifiedAbsence: z.boolean().default(false),
  requiresDocument: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
  affectsPlannedHours: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10000).default(0)
});

const frequencyInput = frequencyBaseInput.refine(
  (value) => value.code !== "AD" && value.shortCode !== "AD",
  { message: "AD e reservado para importacao ambigua" }
);

export async function hrWorkforceCatalogRoutes(app: FastifyInstance) {
  app.get("/hr/workforce/reference-data", { preHandler: [app.authenticate, requireHrPermission(HrPermission.SCHEDULE_VIEW)] }, async (request) => {
    const query = z.object({ companyId: z.string().optional(), competence: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.query);
    const scope = await resolveHrDataScope(request);
    if (query.companyId) assertCompanyAccess(scope, query.companyId);
    const companyIds = query.companyId ? [query.companyId] : scope.companyIds;
    const competence = query.competence ? startOfCompetence(`${query.competence}-01`) : startOfCompetence(new Date());
    const organizationUnitFilter = scope.allUnitsInCompanies ? undefined : { in: scope.unitIds };
    const [companies, units, departments, positions, costCenters, teams, employees, shifts, patterns, frequencyTypes, holidays, periods] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" } }),
      prisma.unit.findMany({ where: { companyId: { in: companyIds }, id: organizationUnitFilter, isActive: true }, select: { id: true, companyId: true, name: true, code: true }, orderBy: { name: "asc" } }),
      prisma.department.findMany({ where: { companyId: { in: companyIds }, isActive: true, deletedAt: null }, select: { id: true, companyId: true, name: true, code: true }, orderBy: { name: "asc" } }),
      prisma.position.findMany({ where: { companyId: { in: companyIds }, isActive: true }, select: { id: true, companyId: true, name: true, code: true }, orderBy: { name: "asc" } }),
      prisma.costCenter.findMany({ where: { companyId: { in: companyIds }, isActive: true }, select: { id: true, companyId: true, name: true, code: true }, orderBy: { name: "asc" } }),
      prisma.team.findMany({ where: { companyId: { in: companyIds }, unitId: organizationUnitFilter, isActive: true }, select: { id: true, companyId: true, unitId: true, departmentId: true, name: true }, orderBy: { name: "asc" } }),
      prisma.employee.findMany({ where: { companyId: { in: companyIds }, unitId: organizationUnitFilter }, select: { id: true, companyId: true, unitId: true, departmentId: true, positionId: true, costCenterId: true, teamId: true, name: true, registration: true, isActive: true }, orderBy: { name: "asc" }, take: 1000 }),
      prisma.workShift.findMany({ where: { companyId: { in: companyIds } }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      prisma.schedulePattern.findMany({ where: { companyId: { in: companyIds } }, include: { days: { include: { shift: true }, orderBy: { cyclePosition: "asc" } } }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      prisma.frequencyType.findMany({ where: { companyId: { in: companyIds } }, orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }] }),
      prisma.holiday.findMany({ where: { companyId: { in: companyIds }, date: { gte: competence, lte: endOfCompetence(competence) }, ...(scope.allUnitsInCompanies ? {} : { OR: [{ unitId: null }, { unitId: { in: scope.unitIds } }] }) }, orderBy: { date: "asc" } }),
      prisma.schedulePeriod.findMany({ where: { companyId: { in: companyIds }, competence, ...(scope.allUnitsInCompanies ? {} : { OR: [{ unitId: null }, { unitId: { in: scope.unitIds } }] }) }, orderBy: { unitId: "asc" } })
    ]);
    return { companies, units, departments, positions, costCenters, teams, employees, shifts, patterns, frequencyTypes, holidays, periods };
  });

  app.post("/hr/workforce/shifts", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SHIFT_MANAGE)] }, async (request, reply) => {
    const body = shiftInput.parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId);
    if (body.endMinute <= body.startMinute && !body.crossesMidnight) return reply.code(400).send({ message: "Turno com saida no dia seguinte deve indicar virada de dia" });
    if (body.endMinute > body.startMinute && body.crossesMidnight) return reply.code(400).send({ message: "Virada de dia incompatível com os horarios informados" });
    const crossesMidnight = body.crossesMidnight;
    const expected = plannedMinutes(body.startMinute, body.endMinute, body.breakMinutes, crossesMidnight);
    const created = await prisma.$transaction(async (tx) => {
      const shift = await tx.workShift.create({ data: { ...body, crossesMidnight, plannedMinutes: expected } });
      await writeAudit(tx, request, { companyId: body.companyId, action: "WORK_SHIFT_CREATE", entityType: "WorkShift", entityId: shift.id, newValue: shift });
      return shift;
    });
    return reply.code(201).send(created);
  });

  app.patch("/hr/workforce/shifts/:id", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SHIFT_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = shiftInput.omit({ companyId: true }).partial().parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.workShift.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "Turno nao encontrado" });
    const startMinute = body.startMinute ?? existing.startMinute;
    const endMinute = body.endMinute ?? existing.endMinute;
    const breakMinutes = body.breakMinutes ?? existing.breakMinutes;
    const crossesMidnight = body.crossesMidnight ?? existing.crossesMidnight;
    if (endMinute <= startMinute && !crossesMidnight) return reply.code(400).send({ message: "Turno com saida no dia seguinte deve indicar virada de dia" });
    if (endMinute > startMinute && crossesMidnight) return reply.code(400).send({ message: "Virada de dia incompatível com os horarios informados" });
    const updated = await prisma.$transaction(async (tx) => {
      const shift = await tx.workShift.update({ where: { id: existing.id }, data: { ...body, crossesMidnight, plannedMinutes: plannedMinutes(startMinute, endMinute, breakMinutes, crossesMidnight) } });
      await writeAudit(tx, request, { companyId: existing.companyId, action: "WORK_SHIFT_UPDATE", entityType: "WorkShift", entityId: existing.id, previousValue: existing, newValue: shift });
      return shift;
    });
    return updated;
  });

  app.post("/hr/workforce/patterns", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_CREATE, HrPermission.SCHEDULE_MANAGE)] }, async (request, reply) => {
    const body = patternInput.parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId);
    if (new Set(body.days.map((day) => day.cyclePosition)).size !== body.days.length || body.days.some((day) => day.cyclePosition > body.cycleDays)) return reply.code(400).send({ message: "Dias do ciclo invalidos ou duplicados" });
    const shiftIds = body.days.flatMap((day) => day.shiftId ? [day.shiftId] : []);
    const shifts = shiftIds.length ? await prisma.workShift.findMany({ where: { id: { in: shiftIds }, companyId: body.companyId, isActive: true } }) : [];
    if (shifts.length !== new Set(shiftIds).size) return reply.code(400).send({ message: "Turno invalido no padrao" });
    const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
    const created = await prisma.$transaction(async (tx) => {
      const pattern = await tx.schedulePattern.create({ data: { companyId: body.companyId, name: body.name, code: body.code, description: body.description, patternType: body.patternType, cycleDays: body.cycleDays, isActive: body.isActive, days: { create: body.days.map((day) => { const shift = day.shiftId ? shiftMap.get(day.shiftId) : undefined; const usesOwnHours = day.startMinute !== null && day.startMinute !== undefined && day.endMinute !== null && day.endMinute !== undefined; const startMinute = day.startMinute ?? shift?.startMinute; const endMinute = day.endMinute ?? shift?.endMinute; const breakMinutes = day.breakMinutes ?? shift?.breakMinutes ?? 0; const crossesMidnight = usesOwnHours ? day.crossesMidnight : (shift?.crossesMidnight ?? day.crossesMidnight); if (day.dayType === ScheduleDayType.WORK && startMinute !== undefined && endMinute !== undefined && ((endMinute <= startMinute) !== crossesMidnight)) throw new Error("Indicacao de virada de dia incompatível com o horario do padrao"); return { ...day, startMinute, endMinute, breakMinutes, crossesMidnight, plannedMinutes: day.dayType === ScheduleDayType.WORK ? plannedMinutes(startMinute, endMinute, breakMinutes, crossesMidnight) : 0 }; }) } }, include: { days: { orderBy: { cyclePosition: "asc" } } } });
      await writeAudit(tx, request, { companyId: body.companyId, action: "SCHEDULE_PATTERN_CREATE", entityType: "SchedulePattern", entityId: pattern.id, newValue: pattern });
      return pattern;
    });
    return reply.code(201).send(created);
  });

  app.patch("/hr/workforce/patterns/:id/status", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_EDIT, HrPermission.SCHEDULE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ isActive: z.boolean() }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.schedulePattern.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "Padrao nao encontrado" });
    const updated = await prisma.$transaction(async (tx) => { const pattern = await tx.schedulePattern.update({ where: { id: existing.id }, data: body }); await writeAudit(tx, request, { companyId: existing.companyId, action: "SCHEDULE_PATTERN_STATUS", entityType: "SchedulePattern", entityId: existing.id, previousValue: { isActive: existing.isActive }, newValue: body }); return pattern; });
    return updated;
  });

  app.post("/hr/workforce/frequency-types", { preHandler: [app.authenticate, requireHrPermission(HrPermission.FREQUENCY_TYPE_MANAGE)] }, async (request, reply) => {
    const body = frequencyInput.parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId);
    const created = await prisma.$transaction(async (tx) => { const frequency = await tx.frequencyType.create({ data: body }); await writeAudit(tx, request, { companyId: body.companyId, action: "FREQUENCY_TYPE_CREATE", entityType: "FrequencyType", entityId: frequency.id, newValue: frequency }); return frequency; });
    return reply.code(201).send(created);
  });

  app.patch("/hr/workforce/frequency-types/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.FREQUENCY_TYPE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = frequencyBaseInput.omit({ companyId: true }).partial().parse(request.body);
    if (body.code === "AD" || body.shortCode === "AD") return reply.code(400).send({ message: "AD e reservado para importacao ambigua" });
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.frequencyType.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "Tipo de frequencia nao encontrado" });
    const updated = await prisma.$transaction(async (tx) => { const frequency = await tx.frequencyType.update({ where: { id: existing.id }, data: body }); await writeAudit(tx, request, { companyId: existing.companyId, action: "FREQUENCY_TYPE_UPDATE", entityType: "FrequencyType", entityId: existing.id, previousValue: existing, newValue: frequency }); return frequency; });
    return updated;
  });

  app.post("/hr/workforce/holidays", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireAnyHrPermission(HrPermission.SCHEDULE_EDIT, HrPermission.CATALOG_MANAGE)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string(), unitId: z.string().optional().nullable(), date: dateSchema, name: z.string().min(2).max(120), scope: z.nativeEnum(HolidayScope), state: z.string().length(2).optional().nullable(), city: z.string().max(120).optional().nullable(), isActive: z.boolean().default(true) }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    await assertOrganizationReferences(body.companyId, { unitId: body.unitId });
    if (body.scope === HolidayScope.UNIT && !body.unitId) return reply.code(400).send({ message: "Feriado de unidade exige unidade" });
    if (body.scope !== HolidayScope.UNIT && body.unitId) return reply.code(400).send({ message: "Somente feriado de unidade pode informar unidade" });
    if (body.scope !== HolidayScope.UNIT && !scope.allUnitsInCompanies) return reply.code(403).send({ message: "Feriado amplo exige acesso a todas as unidades da empresa" });
    const created = await prisma.$transaction(async (tx) => { const holiday = await tx.holiday.create({ data: { ...body, date: new Date(`${body.date}T12:00:00-03:00`) } }); await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: "HOLIDAY_CREATE", entityType: "Holiday", entityId: holiday.id, newValue: holiday }); return holiday; });
    return reply.code(201).send(created);
  });
}
