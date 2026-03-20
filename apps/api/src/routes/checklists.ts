import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ChecklistItemResult, ChecklistResponseType, MaintenancePriority, MaintenanceType } from "@prisma/client";
import { prisma } from "../prisma.js";

const itemPayloadSchema = z.object({
  templateItemId: z.string().cuid(),
  result: z.nativeEnum(ChecklistItemResult).optional().nullable(),
  numericValue: z.number().optional().nullable(),
  textValue: z.string().optional().nullable(),
  problemDescription: z.string().optional().nullable(),
  attachmentIds: z.array(z.string().cuid()).optional()
});

function isProblemResult(result: ChecklistItemResult | null | undefined): boolean {
  return result === ChecklistItemResult.PROBLEM || result === ChecklistItemResult.NO;
}

function validateItemInput(responseType: ChecklistResponseType, item: z.infer<typeof itemPayloadSchema>) {
  if (responseType === ChecklistResponseType.OK_PROBLEM_NA || responseType === ChecklistResponseType.YES_NO) {
    if (!item.result) {
      throw new Error("Resultado obrigatório para item de opção");
    }
  }

  if (responseType === ChecklistResponseType.NUMBER && item.numericValue === null) {
    throw new Error("Valor numérico obrigatório");
  }

  if (responseType === ChecklistResponseType.TEXT && !item.textValue) {
    throw new Error("Texto obrigatório");
  }
}

export async function checklistRoutes(app: FastifyInstance) {
  app.get("/checklist-templates", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({ equipmentId: z.string().cuid().optional() }).parse(request.query);

    return prisma.checklistTemplate.findMany({
      where: query.equipmentId ? { equipmentId: query.equipmentId } : undefined,
      include: { items: { orderBy: { position: "asc" } }, equipment: true },
      orderBy: { name: "asc" }
    });
  });

  app.post("/checklist-templates", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      periodicity: z.enum(["DIARIO", "SEMANAL", "MENSAL"]),
      equipmentId: z.string().cuid(),
      items: z.array(
        z.object({
          label: z.string().min(2),
          instruction: z.string().optional().nullable(),
          responseType: z.nativeEnum(ChecklistResponseType),
          position: z.number().int().nonnegative(),
          required: z.boolean().optional(),
          createsMaintenanceOnProblem: z.boolean().optional()
        })
      ).min(1)
    }).parse(request.body);

    const template = await prisma.checklistTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        periodicity: body.periodicity,
        equipmentId: body.equipmentId,
        items: {
          create: body.items
        }
      },
      include: { items: { orderBy: { position: "asc" } } }
    });

    return reply.code(201).send(template);
  });

  app.get("/checklist-executions", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({
      equipmentId: z.string().cuid().optional(),
      templateId: z.string().cuid().optional()
    }).parse(request.query);

    return prisma.checklistExecution.findMany({
      where: {
        equipmentId: query.equipmentId,
        templateId: query.templateId
      },
      include: {
        template: true,
        equipment: true,
        operator: true,
        items: { include: { templateItem: true, attachments: true } },
        maintenances: true,
        attachments: true
      },
      orderBy: { executedAt: "desc" }
    });
  });

  app.post("/checklist-executions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      templateId: z.string().cuid(),
      equipmentId: z.string().cuid(),
      operatorId: z.string().cuid(),
      notes: z.string().optional().nullable(),
      attachmentIds: z.array(z.string().cuid()).optional(),
      items: z.array(itemPayloadSchema).min(1)
    }).parse(request.body);

    const template = await prisma.checklistTemplate.findUnique({
      where: { id: body.templateId },
      include: { items: true }
    });

    if (!template) {
      return reply.code(404).send({ message: "Template não encontrado" });
    }

    const templateItemMap = new Map(template.items.map((item) => [item.id, item]));

    for (const itemInput of body.items) {
      const templateItem = templateItemMap.get(itemInput.templateItemId);
      if (!templateItem) {
        return reply.code(400).send({ message: `Item ${itemInput.templateItemId} não pertence ao template` });
      }

      validateItemInput(templateItem.responseType, itemInput);

      const isProblem = isProblemResult(itemInput.result);
      if (isProblem) {
        if (!itemInput.problemDescription?.trim()) {
          return reply.code(400).send({ message: `Descrição obrigatória para problema no item: ${templateItem.label}` });
        }

        if (!itemInput.attachmentIds || itemInput.attachmentIds.length === 0) {
          return reply.code(400).send({ message: `Foto obrigatória para problema no item: ${templateItem.label}` });
        }
      }
    }

    const hasProblem = body.items.some((itemInput) => isProblemResult(itemInput.result));

    const execution = await prisma.$transaction(async (tx) => {
      const createdExecution = await tx.checklistExecution.create({
        data: {
          templateId: body.templateId,
          equipmentId: body.equipmentId,
          operatorId: body.operatorId,
          notes: body.notes,
          hadProblem: hasProblem,
          attachments: body.attachmentIds
            ? { connect: body.attachmentIds.map((id) => ({ id })) }
            : undefined
        }
      });

      for (const itemInput of body.items) {
        const templateItem = templateItemMap.get(itemInput.templateItemId)!;
        const executionItem = await tx.checklistExecutionItem.create({
          data: {
            executionId: createdExecution.id,
            templateItemId: itemInput.templateItemId,
            result: itemInput.result,
            numericValue: itemInput.numericValue,
            textValue: itemInput.textValue,
            problemDescription: itemInput.problemDescription,
            attachments: itemInput.attachmentIds
              ? { connect: itemInput.attachmentIds.map((id) => ({ id })) }
              : undefined
          }
        });

        if (templateItem.createsMaintenanceOnProblem && isProblemResult(itemInput.result)) {
          await tx.maintenance.create({
            data: {
              equipmentId: body.equipmentId,
              type: MaintenanceType.CORRECTIVE,
              description: `[Checklist] ${templateItem.label}: ${itemInput.problemDescription}`,
              priority: MaintenancePriority.HIGH,
              checklistExecutionId: createdExecution.id,
              history: `Ocorrência criada automaticamente no item ${templateItem.label} (${executionItem.id})`
            }
          });
        }
      }

      return tx.checklistExecution.findUniqueOrThrow({
        where: { id: createdExecution.id },
        include: {
          items: { include: { templateItem: true, attachments: true } },
          maintenances: true,
          equipment: true,
          operator: true,
          template: true,
          attachments: true
        }
      });
    });

    return reply.code(201).send(execution);
  });
}
