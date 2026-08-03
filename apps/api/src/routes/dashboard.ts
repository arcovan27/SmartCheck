import type { FastifyInstance } from "fastify";
import { MaintenanceStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { publicUserSelect } from "../services/hrAccess.js";

function startOfToday(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeekMonday(date: Date) {
  const result = startOfToday(date);
  const day = result.getDay(); // 0 (domingo) ... 6 (sabado)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diffToMonday);
  return result;
}

function startOfMonth(date: Date) {
  const result = startOfToday(date);
  result.setDate(1);
  return result;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", { preHandler: [app.authenticate] }, async () => {
    const now = new Date();
    const dayStart = startOfToday(now);
    const weekStart = startOfWeekMonday(now);
    const monthStart = startOfMonth(now);

    const [
      activeEmployees,
      totalEpis,
      lowStockEpis,
      activeEquipments,
      openMaintenances,
      activeChecklistTemplates,
      recentChecklistExecutions,
      recentMaintenances,
      recentChecklistProblems,
      recentEpiDeliveries
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.epi.count(),
      prisma.epi.findMany({
        where: { isActive: true },
        select: { stock: true, minimumStock: true }
      }),
      prisma.equipment.count({ where: { isActive: true } }),
      prisma.maintenance.count({ where: { status: { not: MaintenanceStatus.CONCLUIDA } } }),
      prisma.checklistTemplate.findMany({
        where: { isActive: true },
        include: {
          equipment: { select: { id: true, isActive: true } },
          equipmentLinks: {
            include: { equipment: { select: { id: true, isActive: true } } }
          }
        }
      }),
      prisma.checklistExecution.findMany({
        where: { executedAt: { gte: monthStart } },
        select: { templateId: true, equipmentId: true, executedAt: true }
      }),
      prisma.maintenance.findMany({
        include: { equipment: true, responsible: true },
        orderBy: { openedAt: "desc" },
        take: 5
      }),
      prisma.checklistExecution.findMany({
        where: { hadProblem: true },
        include: { equipment: true, employee: true, template: true },
        orderBy: { executedAt: "desc" },
        take: 5
      }),
      prisma.epiDelivery.findMany({
        include: { employee: true, epi: true, responsibleUser: { select: publicUserSelect } },
        orderBy: { date: "desc" },
        take: 5
      })
    ]);

    let pendingChecklists = 0;

    for (const template of activeChecklistTemplates) {
      const equipmentIds = new Set<string>();

      if (template.equipment?.isActive) {
        equipmentIds.add(template.equipment.id);
      }

      for (const link of template.equipmentLinks) {
        if (link.equipment?.isActive) {
          equipmentIds.add(link.equipment.id);
        }
      }

      for (const equipmentId of equipmentIds) {
        const hasExecutionInPeriod = recentChecklistExecutions.some((execution) => {
          if (execution.templateId !== template.id) return false;
          if (execution.equipmentId !== equipmentId) return false;

          if (template.periodicity === "DIARIO") return execution.executedAt >= dayStart;
          if (template.periodicity === "SEMANAL") return execution.executedAt >= weekStart;
          return execution.executedAt >= monthStart; // MENSAL
        });

        if (!hasExecutionInPeriod) {
          pendingChecklists += 1;
        }
      }
    }

    return {
      cards: {
        activeEmployees,
        totalEpis,
        lowStockEpis: lowStockEpis.filter((epi) => epi.stock <= epi.minimumStock).length,
        activeEquipments,
        openMaintenances,
        pendingChecklists
      },
      recentMaintenances,
      recentChecklistProblems,
      recentEpiDeliveries
    };
  });
}
