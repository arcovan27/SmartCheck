import type { FastifyInstance } from "fastify";
import { EpiMovementType, HrPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { assertCompanyAccess, hasHrPermission, publicUserSelect, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";

export async function hrEpiRoutes(app: FastifyInstance) {
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
        movementType: z.nativeEnum(EpiMovementType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).parse(request.query);
      const scope = await resolveHrDataScope(request);
      if (query.companyId) assertCompanyAccess(scope, query.companyId);
      const where = {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        employeeId: query.employeeId,
        epiId: query.epiId,
        movementType: query.movementType,
        date: query.startDate || query.endDate ? { gte: query.startDate, lte: query.endDate } : undefined
      };
      const [items, total] = await prisma.$transaction([
        prisma.epiDelivery.findMany({
          where,
          select: {
            id: true, movementType: true, quantity: true, date: true, notes: true, movementReason: true,
            unitCostSnapshot: true, costSource: true, isEstimatedCost: true,
            employee: { select: { id: true, name: true, registration: true } },
            epi: { select: { id: true, name: true, ca: true, unit: true } },
            responsibleUser: { select: publicUserSelect }
          },
          orderBy: { date: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.epiDelivery.count({ where })
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
  );
}
