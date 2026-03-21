import type { FastifyInstance } from "fastify";
import { MaintenanceStatus } from "@prisma/client";
import { prisma } from "../prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", { preHandler: [app.authenticate] }, async () => {
    const [
      activeEmployees,
      totalEpis,
      activeEquipments,
      openMaintenances,
      pendingChecklists,
      duePreventiveAlerts,
      recentMaintenances,
      recentChecklistProblems,
      recentEpiDeliveries
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.epi.count(),
      prisma.equipment.count({ where: { isActive: true } }),
      prisma.maintenance.count({ where: { status: { not: MaintenanceStatus.CONCLUIDA } } }),
      prisma.checklistTemplate.count({ where: { isActive: true } }),
      prisma.maintenancePlan.count({ where: { isActive: true } }),
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
        include: { employee: true, epi: true, responsibleUser: true },
        orderBy: { date: "desc" },
        take: 5
      })
    ]);

    return {
      cards: {
        activeEmployees,
        totalEpis,
        activeEquipments,
        openMaintenances,
        pendingChecklists,
        duePreventiveAlerts
      },
      recentMaintenances,
      recentChecklistProblems,
      recentEpiDeliveries
    };
  });
}
