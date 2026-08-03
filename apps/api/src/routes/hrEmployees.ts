import type { FastifyInstance } from "fastify";
import { HrPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { assertCompanyAccess, hasHrPermission, publicUserSelect, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";

export async function hrEmployeeRoutes(app: FastifyInstance) {
  app.get(
    "/hr/employees",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_VIEW)] },
    async (request) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        departmentId: z.string().optional(),
        positionId: z.string().optional(),
        teamId: z.string().optional(),
        isActive: z.coerce.boolean().optional()
      }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      if (query.companyId) assertCompanyAccess(scope, query.companyId);
      const where = {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        departmentId: query.departmentId,
        positionId: query.positionId,
        teamId: query.teamId,
        isActive: query.isActive,
        OR: query.search ? [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { registration: { contains: query.search, mode: "insensitive" as const } },
          { department: { contains: query.search, mode: "insensitive" as const } },
          { position: { contains: query.search, mode: "insensitive" as const } }
        ] : undefined
      };
      const [items, total, active, away] = await prisma.$transaction([
        prisma.employee.findMany({
          where,
          select: {
            id: true, name: true, registration: true, department: true, position: true, email: true, phone: true,
            admissionDate: true, dismissalDate: true, isActive: true, inactiveEffectiveDate: true, inactiveReason: true, photoPath: true, companyId: true, unitId: true,
            company: { select: { id: true, legalName: true, tradeName: true } },
            unitRef: { select: { id: true, name: true } },
            departmentRef: { select: { id: true, name: true, deletedAt: true } },
            positionRef: { select: { id: true, name: true } },
            costCenter: { select: { id: true, name: true, code: true } },
            team: { select: { id: true, name: true } },
            user: { select: publicUserSelect },
            biometric: { select: { status: true, provider: true } }
          },
          orderBy: { name: "asc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.employee.count({ where }),
        prisma.employee.count({ where: { ...where, isActive: true } }),
        prisma.employeeOccurrence.findMany({ where: { employee: where, deletedAt: null, status: "APROVADO", startDate: { lte: new Date() }, endDate: { gte: new Date() } }, distinct: ["employeeId"], select: { employeeId: true } })
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize, summary: { active, away: away.length } };
    }
  );

  app.get(
    "/hr/employees/:id",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_VIEW)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const [canViewEpi, canViewSchedules, canViewOccurrences, canViewDocuments, canViewWarnings, canViewSuspensions, canViewWorkAccidents] = await Promise.all([
        hasHrPermission(request.user.role, HrPermission.EPI_VIEW),
        hasHrPermission(request.user.role, HrPermission.SCHEDULE_VIEW),
        Promise.all([hasHrPermission(request.user.role, HrPermission.OCCURRENCE_VIEW), hasHrPermission(request.user.role, HrPermission.OCCURRENCE_REVIEW)]).then((values) => values.some(Boolean)),
        hasHrPermission(request.user.role, HrPermission.DOCUMENT_VIEW),
        hasHrPermission(request.user.role, HrPermission.WARNING_VIEW),
        hasHrPermission(request.user.role, HrPermission.SUSPENSION_VIEW),
        hasHrPermission(request.user.role, HrPermission.WORK_ACCIDENT_VIEW)
      ]);
      const employee = await prisma.employee.findFirst({
        where: { id: params.id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
        select: {
          id: true, name: true, registration: true, cpf: true, department: true, position: true, email: true, phone: true,
          admissionDate: true, dismissalDate: true, isActive: true, inactiveEffectiveDate: true, inactiveReason: true, inactiveNotes: true, photoPath: true, notes: true, companyId: true, unitId: true,
          company: { select: { id: true, legalName: true, tradeName: true } }, unitRef: { select: { id: true, name: true } },
          departmentRef: { select: { id: true, name: true, deletedAt: true } }, positionRef: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true, code: true } }, team: { select: { id: true, name: true } },
          user: { select: publicUserSelect }, biometric: { select: { status: true, provider: true } },
          statusHistory: { select: { id: true, previousStatus: true, newStatus: true, reason: true, effectiveDate: true, notes: true, departmentNameSnapshot: true, futureSchedulesAffected: true, assignmentsAffected: true, createdAt: true, changedBy: { select: publicUserSelect } }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], take: 50 }
        }
      });
      if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });

      const [epiMovements, schedules, occurrences] = await Promise.all([
        canViewEpi ? prisma.epiDelivery.findMany({ where: { employeeId: employee.id }, select: { id: true, movementType: true, quantity: true, date: true, epi: { select: { id: true, name: true, ca: true } } }, orderBy: { date: "desc" }, take: 30 }) : Promise.resolve([]),
        canViewSchedules ? prisma.workSchedule.findMany({ where: { employeeId: employee.id, status: "ATIVA", endAt: { gte: new Date() } }, select: { id: true, startAt: true, endAt: true, status: true, shift: { select: { id: true, name: true } }, team: { select: { id: true, name: true } } }, orderBy: { startAt: "asc" }, take: 30 }) : Promise.resolve([]),
        canViewOccurrences ? prisma.employeeOccurrence.findMany({
          where: {
            employeeId: employee.id,
            AND: [
              ...(!canViewWarnings ? [{ NOT: { OR: [{ frequencyType: { code: "ADVERT" } }, { frequencyTypeId: null, type: "ADVERTENCIA" as const }] } }] : []),
              ...(!canViewSuspensions ? [{ NOT: { OR: [{ frequencyType: { code: "SUSP" } }, { frequencyTypeId: null, type: "SUSPENSAO" as const }] } }] : []),
              ...(!canViewWorkAccidents ? [{ NOT: { OR: [{ frequencyType: { code: "ACID_TRAB" } }, { frequencyTypeId: null, type: "ACIDENTE_TRABALHO" as const }] } }] : [])
            ]
          },
          select: {
            id: true, type: true, startDate: true, endDate: true, hoursAway: true, daysAway: true, isJustified: true, description: true, status: true,
            accidentOccurredAt: true, accidentLocation: true, hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true, catNumber: true,
            frequencyType: { select: { code: true, shortCode: true, name: true, category: true, color: true } },
            reason: { select: { id: true, name: true } }, attachments: canViewDocuments ? { where: { deletedAt: null }, select: { id: true, filename: true, mimeType: true, createdAt: true } } : false
          }, orderBy: { startDate: "desc" }, take: 30
        }) : Promise.resolve([])
      ]);
      return { ...employee, epiMovements, schedules, occurrences, capabilities: { canViewEpi, canViewSchedules, canViewOccurrences, canViewDocuments } };
    }
  );
}
