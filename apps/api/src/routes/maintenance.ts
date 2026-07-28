import type { FastifyInstance } from "fastify";
import {
  MaintenancePlanTriggerType,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { evaluatePlan } from "../services/maintenanceAlerts.js";
import { checklistReadingsForResponse } from "../services/checklistReadings.js";

export async function maintenanceRoutes(app: FastifyInstance) {
  app.get("/maintenances", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        equipmentId: z.string().cuid().optional(),
        status: z.nativeEnum(MaintenanceStatus).optional(),
        type: z.nativeEnum(MaintenanceType).optional()
      })
      .parse(request.query);

    return prisma.maintenance.findMany({
      where: {
        equipmentId: query.equipmentId,
        status: query.status,
        type: query.type
      },
      include: {
        equipment: true,
        responsible: true,
        attachments: true,
        checklistExecution: true
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }]
    });
  });

  app.post("/maintenances", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        equipmentId: z.string().cuid(),
        checklistExecutionId: z.string().cuid().optional().nullable(),
        type: z.nativeEnum(MaintenanceType),
        description: z.string().min(3),
        status: z.nativeEnum(MaintenanceStatus).optional(),
        priority: z.nativeEnum(MaintenancePriority).optional(),
        cause: z.string().optional().nullable(),
        responsibleId: z.string().cuid().optional().nullable(),
        openedAt: z.coerce.date().optional(),
        concludedAt: z.coerce.date().optional().nullable(),
        notes: z.string().optional().nullable(),
        attachmentIds: z.array(z.string().cuid()).optional()
      })
      .parse(request.body);

    const maintenance = await prisma.maintenance.create({
      data: {
        equipmentId: body.equipmentId,
        checklistExecutionId: body.checklistExecutionId,
        type: body.type,
        description: body.description,
        status: body.status ?? MaintenanceStatus.ABERTA,
        priority: body.priority ?? MaintenancePriority.MEDIA,
        cause: body.cause,
        responsibleId: body.responsibleId,
        openedAt: body.openedAt ?? new Date(),
        concludedAt: body.concludedAt,
        notes: body.notes,
        attachments: body.attachmentIds ? { connect: body.attachmentIds.map((id) => ({ id })) } : undefined
      },
      include: {
        equipment: true,
        responsible: true,
        attachments: true
      }
    });

    return reply.code(201).send(maintenance);
  });

  app.patch("/maintenances/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        description: z.string().min(3).optional(),
        status: z.nativeEnum(MaintenanceStatus).optional(),
        priority: z.nativeEnum(MaintenancePriority).optional(),
        cause: z.string().optional().nullable(),
        responsibleId: z.string().cuid().optional().nullable(),
        openedAt: z.coerce.date().optional(),
        concludedAt: z.coerce.date().optional().nullable(),
        notes: z.string().optional().nullable()
      })
      .parse(request.body);

    return prisma.maintenance.update({
      where: { id: params.id },
      data: body,
      include: {
        equipment: true,
        responsible: true,
        attachments: true
      }
    });
  });

  app.get("/maintenance-plans", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({ equipmentId: z.string().cuid().optional() }).parse(request.query);

    return prisma.maintenancePlan.findMany({
      where: {
        equipmentId: query.equipmentId
      },
      include: { equipment: true },
      orderBy: { createdAt: "desc" }
    });
  });

  app.post("/maintenance-plans", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        equipmentId: z.string().cuid(),
        title: z.string().min(2),
        description: z.string().optional().nullable(),
        triggerType: z.nativeEnum(MaintenancePlanTriggerType),
        threshold: z.number().positive(),
        nearThreshold: z.number().positive().optional().nullable(),
        lastExecutionDate: z.coerce.date().optional().nullable(),
        lastExecutionValue: z.number().optional().nullable(),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    const plan = await prisma.maintenancePlan.create({
      data: {
        ...body,
        isActive: body.isActive ?? true
      }
    });

    return reply.code(201).send(plan);
  });

  app.patch("/maintenance-plans/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(2).optional(),
        description: z.string().optional().nullable(),
        triggerType: z.nativeEnum(MaintenancePlanTriggerType).optional(),
        threshold: z.number().positive().optional(),
        nearThreshold: z.number().positive().optional().nullable(),
        lastExecutionDate: z.coerce.date().optional().nullable(),
        lastExecutionValue: z.number().optional().nullable(),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    return prisma.maintenancePlan.update({
      where: { id: params.id },
      data: body
    });
  });

  app.get("/maintenance-alerts", { preHandler: [app.authenticate] }, async () => {
    const plans = await prisma.maintenancePlan.findMany({
      where: { isActive: true },
      include: { equipment: true }
    });

    return plans.map((plan) => ({
      equipment: {
        id: plan.equipment.id,
        name: plan.equipment.name,
        mileage: plan.equipment.mileage,
        hourmeter: plan.equipment.hourmeter
      },
      plan: {
        id: plan.id,
        title: plan.title,
        triggerType: plan.triggerType
      },
      alert: evaluatePlan(plan, plan.equipment)
    }));
  });

  app.get("/history/equipment/:equipmentId", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ equipmentId: z.string().cuid() }).parse(request.params);

    const [checklists, maintenances, plans, equipment] = await Promise.all([
      prisma.checklistExecution.findMany({
        where: { equipmentId: params.equipmentId },
        include: {
          template: true,
          employee: true,
          maintenances: true,
          items: {
            where: { hadProblem: true },
            include: { templateItem: true, attachments: true }
          }
        },
        orderBy: { executedAt: "desc" }
      }),
      prisma.maintenance.findMany({
        where: { equipmentId: params.equipmentId },
        include: { responsible: true, attachments: true },
        orderBy: { openedAt: "desc" }
      }),
      prisma.maintenancePlan.findMany({
        where: { equipmentId: params.equipmentId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.equipment.findUnique({ where: { id: params.equipmentId } })
    ]);

    const planAlerts = equipment
      ? plans.map((plan) => ({
          plan,
          alert: evaluatePlan(plan, equipment)
        }))
      : [];

    return {
      checklists: checklists.map((execution) => ({
        ...execution,
        readings: checklistReadingsForResponse(execution)
      })),
      maintenances,
      plans,
      planAlerts
    };
  });
}
