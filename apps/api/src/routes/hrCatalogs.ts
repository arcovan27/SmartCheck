import type { FastifyInstance, FastifyRequest } from "fastify";
import { EmployeeOccurrenceType, HrPermission, Prisma, ScheduleAssignmentStatus, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, hasHrPermission, requireAnyHrPermission, resolveHrDataScope } from "../services/hrAccess.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";
import { departmentDeletionBlockers, visibleDepartmentWhere } from "../services/hrSafety.js";
import { legacyOccurrenceType, occurrenceFrequencyCodes } from "../services/occurrenceWorkflow.js";

const catalogType = z.enum(["units", "departments", "positions", "cost-centers", "teams", "shifts", "absence-reasons"]);
const baseCatalogInput = z.object({
  companyId: z.string(),
  name: z.string().min(2).max(120),
  code: z.string().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
  unitId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  endMinute: z.number().int().min(0).max(1439).optional(),
  occurrenceType: z.nativeEnum(EmployeeOccurrenceType).optional(),
  frequencyCode: z.enum(occurrenceFrequencyCodes).optional()
});

const departmentDeletionInput = z.object({
  confirmationName: z.string().min(1).max(120),
  reason: z.string().trim().min(3).max(500),
  targetDepartmentId: z.string().optional().nullable()
});

async function canManageCatalog(request: FastifyRequest, type: z.infer<typeof catalogType>, action: "create" | "update", isDeactivation = false) {
  if (await hasHrPermission(request.user.role, HrPermission.CATALOG_MANAGE)) return true;
  if (type !== "departments") return false;
  const permission = action === "create"
    ? HrPermission.DEPARTMENT_CREATE
    : isDeactivation
      ? HrPermission.DEPARTMENT_DEACTIVATE
      : HrPermission.DEPARTMENT_EDIT;
  return hasHrPermission(request.user.role, permission);
}

type DepartmentDb = typeof prisma | Prisma.TransactionClient;

async function getDepartmentDeletionImpact(db: DepartmentDb, department: { id: string; companyId: string; name: string }) {
  const employeeWhere: Prisma.EmployeeWhereInput = {
    companyId: department.companyId,
    isActive: true,
    OR: [
      { departmentId: department.id },
      { departmentId: null, department: { equals: department.name, mode: "insensitive" } }
    ]
  };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [activeEmployees, activeTeams, activeAssignments, futureSchedules, employees] = await Promise.all([
    db.employee.count({ where: employeeWhere }),
    db.team.count({ where: { companyId: department.companyId, departmentId: department.id, isActive: true } }),
    db.scheduleAssignment.count({
      where: {
        companyId: department.companyId,
        departmentId: department.id,
        status: ScheduleAssignmentStatus.ACTIVE,
        OR: [{ validUntil: null }, { validUntil: { gte: today } }]
      }
    }),
    db.workSchedule.count({
      where: {
        companyId: department.companyId,
        departmentId: department.id,
        status: WorkScheduleStatus.ATIVA,
        endAt: { gt: new Date() }
      }
    }),
    db.employee.findMany({
      where: employeeWhere,
      select: { id: true, name: true, registration: true, unitRef: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
      take: 20
    })
  ]);
  return { activeEmployees, activeTeams, activeAssignments, futureSchedules, employees };
}

export async function hrCatalogRoutes(app: FastifyInstance) {
  app.get(
    "/hr/catalogs",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.CATALOG_MANAGE, HrPermission.DEPARTMENT_VIEW)] },
    async (request) => {
      const scope = await resolveHrDataScope(request);
      const companyIds = scope.companyIds;
      const [units, departments, positions, costCenters, teams, shifts, absenceReasons] = await Promise.all([
        prisma.unit.findMany({ where: { companyId: { in: companyIds } }, orderBy: { name: "asc" } }),
        prisma.department.findMany({ where: { companyId: { in: companyIds }, ...visibleDepartmentWhere }, orderBy: { name: "asc" } }),
        prisma.position.findMany({ where: { companyId: { in: companyIds } }, orderBy: { name: "asc" } }),
        prisma.costCenter.findMany({ where: { companyId: { in: companyIds } }, orderBy: { name: "asc" } }),
        prisma.team.findMany({ where: { companyId: { in: companyIds } }, include: { unit: { select: { name: true } }, department: { select: { name: true } } }, orderBy: { name: "asc" } }),
        prisma.workShift.findMany({ where: { companyId: { in: companyIds } }, orderBy: { name: "asc" } }),
        prisma.absenceReason.findMany({ where: { companyId: { in: companyIds } }, include: { frequencyType: { select: { code: true, name: true } } }, orderBy: { name: "asc" } })
      ]);
      return { units, departments, positions, costCenters, teams, shifts, absenceReasons };
    }
  );

  app.post(
    "/hr/catalogs/:type",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ type: catalogType }).parse(request.params);
      const body = baseCatalogInput.parse(request.body);
      if (!(await canManageCatalog(request, params.type, "create"))) return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
      const scope = await resolveHrDataScope(request);
      assertCompanyAccess(scope, body.companyId);
      assertUnitAccess(scope, body.unitId);
      await assertOrganizationReferences(body.companyId, body);

      const record = await prisma.$transaction(async (tx) => {
        let created: { id: string; companyId: string; [key: string]: unknown };
        switch (params.type) {
          case "units":
            created = await tx.unit.create({ data: { companyId: body.companyId, name: body.name, code: body.code, isActive: body.isActive ?? true } });
            break;
          case "departments":
            created = await tx.department.create({ data: { companyId: body.companyId, name: body.name, code: body.code, isActive: body.isActive ?? true } });
            break;
          case "positions":
            created = await tx.position.create({ data: { companyId: body.companyId, name: body.name, code: body.code, isActive: body.isActive ?? true } });
            break;
          case "cost-centers":
            if (!body.code) throw new Error("Codigo e obrigatorio para centro de custo");
            created = await tx.costCenter.create({ data: { companyId: body.companyId, name: body.name, code: body.code, isActive: body.isActive ?? true } });
            break;
          case "teams":
            created = await tx.team.create({ data: { companyId: body.companyId, name: body.name, unitId: body.unitId, departmentId: body.departmentId, isActive: body.isActive ?? true } });
            break;
          case "shifts":
            if (body.startMinute === undefined || body.endMinute === undefined) throw new Error("Horarios sao obrigatorios para o turno");
            created = await tx.workShift.create({ data: { companyId: body.companyId, name: body.name, startMinute: body.startMinute, endMinute: body.endMinute, crossesMidnight: body.endMinute <= body.startMinute, isActive: body.isActive ?? true } });
            break;
          case "absence-reasons":
            if (!body.occurrenceType && !body.frequencyCode) throw new Error("Tipo de ocorrencia e obrigatorio para o motivo");
            const reasonFrequency = body.frequencyCode ? await tx.frequencyType.findFirst({ where: { companyId: body.companyId, code: body.frequencyCode, isActive: true } }) : null;
            if (body.frequencyCode && !reasonFrequency) throw new Error("Tipo de ocorrencia inexistente ou inativo");
            created = await tx.absenceReason.create({ data: { companyId: body.companyId, name: body.name, occurrenceType: body.occurrenceType ?? legacyOccurrenceType(body.frequencyCode!), frequencyTypeId: reasonFrequency?.id, isActive: body.isActive ?? true } });
            break;
        }
        await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: "CATALOG_CREATE", entityType: params.type, entityId: created.id, newValue: created });
        return created;
      });
      return reply.code(201).send(record);
    }
  );

  app.patch(
    "/hr/catalogs/:type/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ type: catalogType, id: z.string() }).parse(request.params);
      const body = baseCatalogInput.omit({ companyId: true }).partial().parse(request.body);
      if (!(await canManageCatalog(request, params.type, "update", body.isActive === false))) return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
      const scope = await resolveHrDataScope(request);
      const companyFilter = { companyId: { in: scope.companyIds }, id: params.id };

      const record = await prisma.$transaction(async (tx) => {
        let existing: any;
        let updated: any;
        switch (params.type) {
          case "units":
            existing = await tx.unit.findFirst({ where: companyFilter });
            if (existing) updated = await tx.unit.update({ where: { id: params.id }, data: { name: body.name, code: body.code, isActive: body.isActive } });
            break;
          case "departments":
            existing = await tx.department.findFirst({ where: { ...companyFilter, ...visibleDepartmentWhere } });
            if (existing) updated = await tx.department.update({ where: { id: params.id }, data: { name: body.name, code: body.code, isActive: body.isActive } });
            break;
          case "positions":
            existing = await tx.position.findFirst({ where: companyFilter });
            if (existing) updated = await tx.position.update({ where: { id: params.id }, data: { name: body.name, code: body.code, isActive: body.isActive } });
            break;
          case "cost-centers":
            existing = await tx.costCenter.findFirst({ where: companyFilter });
            if (existing) updated = await tx.costCenter.update({ where: { id: params.id }, data: { name: body.name, code: body.code === null ? undefined : body.code, isActive: body.isActive } });
            break;
          case "teams":
            existing = await tx.team.findFirst({ where: companyFilter });
            if (existing) {
              await assertOrganizationReferences(existing.companyId, body);
              updated = await tx.team.update({ where: { id: params.id }, data: { name: body.name, unitId: body.unitId, departmentId: body.departmentId, isActive: body.isActive } });
            }
            break;
          case "shifts":
            existing = await tx.workShift.findFirst({ where: companyFilter });
            if (existing) updated = await tx.workShift.update({ where: { id: params.id }, data: { name: body.name, startMinute: body.startMinute, endMinute: body.endMinute, crossesMidnight: body.startMinute !== undefined && body.endMinute !== undefined ? body.endMinute <= body.startMinute : undefined, isActive: body.isActive } });
            break;
          case "absence-reasons":
            existing = await tx.absenceReason.findFirst({ where: companyFilter });
            if (existing) {
              const reasonFrequency = body.frequencyCode ? await tx.frequencyType.findFirst({ where: { companyId: existing.companyId, code: body.frequencyCode, isActive: true } }) : null;
              if (body.frequencyCode && !reasonFrequency) throw new Error("Tipo de ocorrencia inexistente ou inativo");
              updated = await tx.absenceReason.update({ where: { id: params.id }, data: { name: body.name, occurrenceType: body.occurrenceType ?? (body.frequencyCode ? legacyOccurrenceType(body.frequencyCode) : undefined), frequencyTypeId: body.frequencyCode ? reasonFrequency?.id : undefined, isActive: body.isActive } });
            }
            break;
        }
        if (!existing || !updated) return null;
        await writeAudit(tx, request, { companyId: existing.companyId, unitId: body.unitId, action: "CATALOG_UPDATE", entityType: params.type, entityId: params.id, previousValue: existing, newValue: updated });
        return updated;
      });
      if (!record) return reply.code(404).send({ message: "Cadastro nao encontrado" });
      return record;
    }
  );

  app.get(
    "/hr/catalogs/departments/:id/deletion-impact",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.CATALOG_MANAGE, HrPermission.DEPARTMENT_DELETE)] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const department = await prisma.department.findFirst({
        where: { id, companyId: { in: scope.companyIds }, ...visibleDepartmentWhere },
        select: { id: true, companyId: true, name: true, code: true, isActive: true }
      });
      if (!department) return reply.code(404).send({ message: "Setor nao encontrado" });
      const impact = await getDepartmentDeletionImpact(prisma, department);
      return {
        department,
        impact,
        blockers: departmentDeletionBlockers(impact, false),
        canDeleteWithoutTransfer: departmentDeletionBlockers(impact, false).length === 0
      };
    }
  );

  app.delete(
    "/hr/catalogs/departments/:id",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.CATALOG_MANAGE, HrPermission.DEPARTMENT_DELETE)] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = departmentDeletionInput.parse(request.body);
      const scope = await resolveHrDataScope(request);
      const department = await prisma.department.findFirst({
        where: { id, companyId: { in: scope.companyIds }, ...visibleDepartmentWhere }
      });
      if (!department) return reply.code(404).send({ message: "Setor nao encontrado" });
      if (body.confirmationName.trim() !== department.name) {
        return reply.code(400).send({ message: "Digite exatamente o nome do setor para confirmar" });
      }

      const target = body.targetDepartmentId
        ? await prisma.department.findFirst({
            where: { id: body.targetDepartmentId, companyId: department.companyId, deletedAt: null, isActive: true }
          })
        : null;
      if (body.targetDepartmentId && (!target || target.id === department.id)) {
        return reply.code(400).send({ message: "Selecione um setor de destino ativo da mesma empresa" });
      }

      const preview = await getDepartmentDeletionImpact(prisma, department);
      const blockers = departmentDeletionBlockers(preview, Boolean(target));
      if (blockers.length > 0) {
        return reply.code(409).send({
          message: "O setor possui vinculos operacionais que impedem a exclusao",
          blockers,
          impact: preview
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const lockedDepartment = await tx.department.findFirst({
          where: { id, companyId: department.companyId, ...visibleDepartmentWhere }
        });
        if (!lockedDepartment) return { kind: "missing" as const };
        const currentTarget = body.targetDepartmentId
          ? await tx.department.findFirst({
              where: {
                id: body.targetDepartmentId,
                companyId: lockedDepartment.companyId,
                deletedAt: null,
                isActive: true,
                NOT: { id: lockedDepartment.id }
              }
            })
          : null;
        if (body.targetDepartmentId && !currentTarget) return { kind: "invalidTarget" as const };
        const currentImpact = await getDepartmentDeletionImpact(tx, lockedDepartment);
        const currentBlockers = departmentDeletionBlockers(currentImpact, Boolean(currentTarget));
        if (currentBlockers.length > 0) return { kind: "blocked" as const, blockers: currentBlockers, impact: currentImpact };

        let transferredEmployees = 0;
        if (currentTarget && currentImpact.activeEmployees > 0) {
          const employeesToTransfer = await tx.employee.findMany({
            where: {
              companyId: lockedDepartment.companyId,
              isActive: true,
              OR: [
                { departmentId: lockedDepartment.id },
                { departmentId: null, department: { equals: lockedDepartment.name, mode: "insensitive" } }
              ]
            },
            select: { id: true }
          });
          const employeeIds = employeesToTransfer.map((employee) => employee.id);
          if (employeeIds.length > 0) {
            await Promise.all([
              tx.employeeOccurrence.updateMany({
                where: { employeeId: { in: employeeIds }, departmentId: null, departmentNameSnapshot: null },
                data: { departmentId: lockedDepartment.id, departmentNameSnapshot: lockedDepartment.name }
              }),
              tx.epiDelivery.updateMany({
                where: { employeeId: { in: employeeIds }, departmentSnapshot: null },
                data: { departmentSnapshot: lockedDepartment.name }
              }),
              tx.checklistExecution.updateMany({
                where: { employeeId: { in: employeeIds }, departmentNameSnapshot: null },
                data: { departmentNameSnapshot: lockedDepartment.name }
              })
            ]);
          }
          const transfer = await tx.employee.updateMany({
            where: {
              companyId: lockedDepartment.companyId,
              isActive: true,
              OR: [
                { departmentId: lockedDepartment.id },
                { departmentId: null, department: { equals: lockedDepartment.name, mode: "insensitive" } }
              ]
            },
            data: { departmentId: currentTarget.id, department: currentTarget.name }
          });
          transferredEmployees = transfer.count;
        }

        const deleted = await tx.department.update({
          where: { id: lockedDepartment.id },
          data: {
            isActive: false,
            deletedAt: new Date(),
            deletedById: request.user.id,
            deletionReason: body.reason
          }
        });
        await writeAudit(tx, request, {
          companyId: lockedDepartment.companyId,
          action: "DEPARTMENT_SOFT_DELETE",
          entityType: "departments",
          entityId: lockedDepartment.id,
          previousValue: lockedDepartment,
          newValue: deleted,
          metadata: {
            reason: body.reason,
            impact: currentImpact,
            transferredEmployees,
            targetDepartmentId: currentTarget?.id ?? null
          }
        });
        return { kind: "deleted" as const, deleted, transferredEmployees };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (result.kind === "missing") return reply.code(404).send({ message: "Setor nao encontrado" });
      if (result.kind === "invalidTarget") return reply.code(409).send({ message: "O setor de destino deixou de estar disponivel. Revise a operacao." });
      if (result.kind === "blocked") return reply.code(409).send({ message: "Os vinculos do setor foram alterados. Revise a operacao.", blockers: result.blockers, impact: result.impact });
      return { message: "Setor excluido com seguranca. O historico foi preservado.", transferredEmployees: result.transferredEmployees };
    }
  );
}
