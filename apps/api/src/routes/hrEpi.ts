import type { FastifyInstance } from "fastify";
import { EpiMovementType, HrPermission, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { assertCompanyAccess, hasHrPermission, publicUserSelect, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { inclusiveDateRange } from "../services/hrSafety.js";
import { env } from "../env.js";

export async function hrEpiRoutes(app: FastifyInstance) {
  app.get(
    "/hr/epi-dashboard",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] },
    async (request, reply) => {
      const query = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        unitId: z.string().optional(),
        departmentId: z.string().cuid().optional()
      }).parse(request.query);
      let range: ReturnType<typeof inclusiveDateRange>;
      try {
        range = inclusiveDateRange(query.startDate, query.endDate, env.APP_TIMEZONE);
      } catch (error) {
        return reply.code(400).send({ message: error instanceof Error ? error.message : "Período inválido" });
      }
      const scope = await resolveHrDataScope(request);
      const canViewCosts = await hasHrPermission(request.user.role, HrPermission.EPI_COST_VIEW);
      const movements = await prisma.epiDelivery.findMany({
        where: {
          companyId: { in: scope.companyIds },
          unitId: unitScopeFilter(scope, query.unitId),
          employee: { departmentId: query.departmentId },
          date: { gte: range.start, lt: range.endExclusive }
        },
        select: {
          movementType: true, quantity: true, employeeId: true, departmentSnapshot: true,
          unitCostSnapshot: canViewCosts,
          unit: { select: { name: true } },
          epi: { select: { id: true, name: true } }
        }
      });
      const deliveryMovements = movements.filter((item) => item.movementType === EpiMovementType.ENTREGA || item.movementType === EpiMovementType.SUBSTITUICAO);
      const byScope = new Map<string, number>();
      const byEpi = new Map<string, { name: string; quantity: number }>();
      let totalCost = 0;
      for (const movement of deliveryMovements) {
        const cost = Number(movement.unitCostSnapshot ?? 0) * movement.quantity;
        totalCost += cost;
        const scopeName = movement.departmentSnapshot || movement.unit?.name || "Sem setor/unidade";
        byScope.set(scopeName, (byScope.get(scopeName) ?? 0) + cost);
        const epi = byEpi.get(movement.epi.id) ?? { name: movement.epi.name, quantity: 0 };
        epi.quantity += movement.quantity;
        byEpi.set(movement.epi.id, epi);
      }
      return {
        period: { startDate: query.startDate, endDate: query.endDate },
        totalDelivered: deliveryMovements.reduce((sum, item) => sum + item.quantity, 0),
        movementCount: movements.length,
        employeesReceiving: new Set(deliveryMovements.map((item) => item.employeeId)).size,
        totalCost: canViewCosts ? totalCost : null,
        costByScope: canViewCosts ? [...byScope.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8) : [],
        topEpis: [...byEpi.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
        canViewCosts
      };
    }
  );

  app.get(
    "/hr/epi-movement-filters",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] },
    async (request) => {
      const scope = await resolveHrDataScope(request);
      const unitWhere = scope.allUnitsInCompanies ? undefined : { in: scope.unitIds };
      const [units, departments, employees, epis] = await Promise.all([
        prisma.unit.findMany({ where: { companyId: { in: scope.companyIds }, id: unitWhere, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.department.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({ where: { companyId: { in: scope.companyIds }, unitId: unitWhere }, select: { id: true, name: true, registration: true }, orderBy: { name: "asc" }, take: 500 }),
        prisma.epi.findMany({ where: { companyId: { in: scope.companyIds }, unitId: unitWhere }, select: { id: true, name: true, ca: true }, orderBy: { name: "asc" } })
      ]);
      return { units, departments, employees, epis };
    }
  );

  app.get(
    "/hr/epis",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] },
    async (request) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        stockStatus: z.enum(["ALL", "LOW", "REGULAR"]).default("ALL"),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        isActive: z.coerce.boolean().optional()
      }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      if (query.companyId) assertCompanyAccess(scope, query.companyId);
      const where = {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        isActive: query.isActive,
        OR: query.search ? [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { category: { contains: query.search, mode: "insensitive" as const } },
          { ca: { contains: query.search, mode: "insensitive" as const } }
        ] : undefined
      };
      const canViewCosts = await hasHrPermission(request.user.role, HrPermission.EPI_COST_VIEW);
      const allForSummary = await prisma.epi.findMany({ where, select: { id: true, stock: true, minimumStock: true } });
      const matchingIds = allForSummary.filter((epi) => query.stockStatus === "ALL" || (query.stockStatus === "LOW" ? epi.stock <= epi.minimumStock : epi.stock > epi.minimumStock)).map((epi) => epi.id);
      const [items, total] = await prisma.$transaction([
        prisma.epi.findMany({
          where: { ...where, id: { in: matchingIds } },
          select: {
            id: true, name: true, description: true, ca: true, category: true, validityDate: true,
            unit: true, purchasePrice: canViewCosts, stock: true, minimumStock: true, isActive: true,
            companyId: true, unitId: true
          },
          orderBy: { name: "asc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.epi.count({ where: { ...where, id: { in: matchingIds } } })
      ]);
      return {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          registered: allForSummary.length,
          stockTotal: allForSummary.reduce((sum, epi) => sum + epi.stock, 0),
          lowStock: allForSummary.filter((epi) => epi.stock <= epi.minimumStock).length
        },
        canViewCosts
      };
    }
  );

  app.get(
    "/hr/epi-movements",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] },
    async (request) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        employeeId: z.string().cuid().optional(),
        epiId: z.string().cuid().optional(),
        departmentId: z.string().cuid().optional(),
        movementType: z.nativeEnum(EpiMovementType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      if (query.companyId) assertCompanyAccess(scope, query.companyId);
      const department = query.departmentId
        ? await prisma.department.findFirst({ where: { id: query.departmentId, companyId: { in: scope.companyIds } }, select: { name: true } })
        : null;
      const where: Prisma.EpiDeliveryWhereInput = {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        employeeId: query.employeeId,
        epiId: query.epiId,
        movementType: query.movementType,
        OR: department ? [{ departmentSnapshot: department.name }, { employee: { departmentId: query.departmentId } }] : undefined,
        date: query.startDate || query.endDate ? { gte: query.startDate, lte: query.endDate } : undefined
      };
      const canViewCosts = await hasHrPermission(request.user.role, HrPermission.EPI_COST_VIEW);
      const [items, total] = await prisma.$transaction([
        prisma.epiDelivery.findMany({
          where,
          select: {
            id: true, movementType: true, quantity: true, date: true, createdAt: true, notes: true, movementReason: true,
            confirmationMethod: true, departmentSnapshot: true,
            unitCostSnapshot: canViewCosts, costSource: canViewCosts, isEstimatedCost: canViewCosts,
            employee: { select: { id: true, name: true, registration: true } },
            epi: { select: { id: true, name: true, ca: true, unit: true } },
            unit: { select: { id: true, name: true } },
            responsibleUser: { select: { ...publicUserSelect, employee: { select: { name: true } } } }
          },
          orderBy: { date: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.epiDelivery.count({ where })
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize, canViewCosts };
    }
  );
}
