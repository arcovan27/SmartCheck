import type { FastifyInstance } from "fastify";
import {
  ChecklistItemType,
  ChecklistOptionResult,
  ChecklistPeriodicity,
  ChecklistTemplateCode,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

const executionItemSchema = z.object({
  templateItemId: z.string().min(1),
  optionResult: z.nativeEnum(ChecklistOptionResult).optional().nullable(),
  booleanResult: z.boolean().optional().nullable(),
  numericValue: z.number().optional().nullable(),
  textValue: z.string().optional().nullable(),
  observation: z.string().optional().nullable(),
  attachmentIds: z.array(z.string().cuid()).optional()
});

function isProblem(itemType: ChecklistItemType, item: z.infer<typeof executionItemSchema>): boolean {
  if (itemType === ChecklistItemType.OK_PROBLEMA_NA) {
    return item.optionResult === ChecklistOptionResult.PROBLEMA;
  }
  if (itemType === ChecklistItemType.SIM_NAO) {
    return item.booleanResult === false;
  }
  return false;
}

function validateByType(itemType: ChecklistItemType, item: z.infer<typeof executionItemSchema>) {
  if (itemType === ChecklistItemType.OK_PROBLEMA_NA && !item.optionResult) {
    throw new Error("Resultado obrigatório para item OK/Problema/N/A");
  }

  if (itemType === ChecklistItemType.SIM_NAO && item.booleanResult === null) {
    throw new Error("Resultado obrigatório para item Sim/Não");
  }

  if (itemType === ChecklistItemType.NUMERO && item.numericValue === null) {
    throw new Error("Valor numérico obrigatório");
  }

  if (itemType === ChecklistItemType.TEXTO && !item.textValue?.trim()) {
    throw new Error("Texto obrigatório");
  }
}

export async function checklistRoutes(app: FastifyInstance) {
  app.get("/checklist-templates", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        equipmentId: z.string().cuid().optional(),
        isActive: z
          .string()
          .optional()
          .transform((value) => {
            if (value === undefined) return undefined;
            return value === "true";
          })
      })
      .parse(request.query);

    return prisma.checklistTemplate.findMany({
      where: {
        ...(query.equipmentId
          ? {
              OR: [{ equipmentId: query.equipmentId }, { equipmentId: null }]
            }
          : {}),
        isActive: query.isActive
      },
      include: {
        equipment: true,
        items: { orderBy: { position: "asc" } }
      },
      orderBy: { name: "asc" }
    });
  });

  app.post("/checklist-templates", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        code: z.nativeEnum(ChecklistTemplateCode).optional(),
        description: z.string().optional().nullable(),
        periodicity: z.nativeEnum(ChecklistPeriodicity),
        equipmentId: z.string().cuid().optional().nullable(),
        isActive: z.boolean().optional(),
        items: z
          .array(
            z.object({
              label: z.string().min(2),
              section: z.string().optional().nullable(),
              instruction: z.string().optional().nullable(),
              itemType: z.nativeEnum(ChecklistItemType),
              position: z.number().int().nonnegative(),
              required: z.boolean().optional(),
              requiresObservationOnProblem: z.boolean().optional(),
              allowsPhotoOnProblem: z.boolean().optional(),
              requiresPhotoOnProblem: z.boolean().optional(),
              opensMaintenanceOnProblem: z.boolean().optional()
            })
          )
          .min(1)
      })
      .parse(request.body);

    const template = await prisma.checklistTemplate.create({
      data: {
        name: body.name,
        code: body.code ?? ChecklistTemplateCode.OUTRO,
        description: body.description,
        periodicity: body.periodicity,
        equipmentId: body.equipmentId ?? null,
        isActive: body.isActive ?? true,
        items: {
          create: body.items
        }
      },
      include: { items: { orderBy: { position: "asc" } }, equipment: true }
    });

    return reply.code(201).send(template);
  });

  app.patch("/checklist-templates/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const body = z
      .object({
        name: z.string().min(2).optional(),
        code: z.nativeEnum(ChecklistTemplateCode).optional(),
        description: z.string().optional().nullable(),
        periodicity: z.nativeEnum(ChecklistPeriodicity).optional(),
        equipmentId: z.string().cuid().optional().nullable(),
        isActive: z.boolean().optional(),
        items: z
          .array(
            z.object({
              id: z.string().cuid().optional(),
              label: z.string().min(2),
              section: z.string().optional().nullable(),
              instruction: z.string().optional().nullable(),
              itemType: z.nativeEnum(ChecklistItemType),
              position: z.number().int().nonnegative(),
              required: z.boolean().optional(),
              requiresObservationOnProblem: z.boolean().optional(),
              allowsPhotoOnProblem: z.boolean().optional(),
              requiresPhotoOnProblem: z.boolean().optional(),
              opensMaintenanceOnProblem: z.boolean().optional()
            })
          )
          .optional()
      })
      .parse(request.body);

    return prisma.$transaction(async (tx) => {
      const existingTemplateItems = await tx.checklistTemplateItem.findMany({
        where: { templateId: params.id },
        select: { id: true, label: true }
      });

      const updatedTemplate = await tx.checklistTemplate.update({
        where: { id: params.id },
        data: {
          name: body.name,
          code: body.code,
          description: body.description,
          periodicity: body.periodicity,
          equipmentId: body.equipmentId === undefined ? undefined : body.equipmentId,
          isActive: body.isActive
        }
      });

      if (body.items) {
        const submittedIds = new Set(body.items.map((item) => item.id).filter(Boolean));
        const removedItems = existingTemplateItems.filter((item) => !submittedIds.has(item.id));

        for (const removed of removedItems) {
          try {
            await tx.checklistTemplateItem.delete({
              where: { id: removed.id }
            });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
              throw new Error(
                `Nao foi possivel remover o item "${removed.label}" porque ele ja possui historico de execucao.`
              );
            }
            throw error;
          }
        }

        for (const item of body.items) {
          if (item.id) {
            await tx.checklistTemplateItem.update({
              where: { id: item.id },
              data: {
                label: item.label,
                section: item.section,
                instruction: item.instruction,
                itemType: item.itemType,
                position: item.position,
                required: item.required,
                requiresObservationOnProblem: item.requiresObservationOnProblem,
                allowsPhotoOnProblem: item.allowsPhotoOnProblem,
                requiresPhotoOnProblem: item.requiresPhotoOnProblem,
                opensMaintenanceOnProblem: item.opensMaintenanceOnProblem
              }
            });
          } else {
            await tx.checklistTemplateItem.create({
              data: {
                templateId: params.id,
                label: item.label,
                section: item.section,
                instruction: item.instruction,
                itemType: item.itemType,
                position: item.position,
                required: item.required,
                requiresObservationOnProblem: item.requiresObservationOnProblem,
                allowsPhotoOnProblem: item.allowsPhotoOnProblem,
                requiresPhotoOnProblem: item.requiresPhotoOnProblem,
                opensMaintenanceOnProblem: item.opensMaintenanceOnProblem
              }
            });
          }
        }
      }

      return tx.checklistTemplate.findUniqueOrThrow({
        where: { id: updatedTemplate.id },
        include: {
          equipment: true,
          items: { orderBy: { position: "asc" } }
        }
      });
    });
  });

  app.delete("/checklist-templates/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    try {
      await prisma.checklistTemplate.delete({
        where: { id: params.id }
      });
      return reply.send({ message: "Modelo de checklist apagado com sucesso" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.code(404).send({ message: "Modelo de checklist nao encontrado" });
        }
        if (error.code === "P2003") {
          return reply
            .code(409)
            .send({ message: "Nao e possivel apagar: este modelo ja possui execucoes registradas" });
        }
      }
      throw error;
    }
  });

  app.get("/checklist-executions", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        equipmentId: z.string().cuid().optional(),
        employeeId: z.string().cuid().optional(),
        hadProblem: z
          .string()
          .optional()
          .transform((value) => {
            if (value === undefined) return undefined;
            return value === "true";
          })
      })
      .parse(request.query);

    return prisma.checklistExecution.findMany({
      where: {
        equipmentId: query.equipmentId,
        employeeId: query.employeeId,
        hadProblem: query.hadProblem
      },
      include: {
        template: true,
        equipment: true,
        employee: true,
        items: {
          include: {
            templateItem: true,
            attachments: true
          }
        },
        maintenances: true
      },
      orderBy: { executedAt: "desc" }
    });
  });

  app.post("/checklist-executions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        templateId: z.string().min(1),
        equipmentId: z.string().cuid(),
        employeeId: z.string().cuid(),
        monthReference: z.string().optional().nullable(),
        operatorName: z.string().optional().nullable(),
        secondaryOperatorName: z.string().optional().nullable(),
        hourmeterValue: z.number().optional().nullable(),
        mileageValue: z.number().optional().nullable(),
        workingHoursStartMonth: z.number().optional().nullable(),
        fuelLevel: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        items: z.array(executionItemSchema).min(1)
      })
      .parse(request.body);

    const template = await prisma.checklistTemplate.findUnique({
      where: { id: body.templateId },
      include: { items: true }
    });

    if (!template) {
      return reply.code(404).send({ message: "Modelo de checklist não encontrado" });
    }

    const mapById = new Map(template.items.map((item) => [item.id, item]));

    for (const inputItem of body.items) {
      const templateItem = mapById.get(inputItem.templateItemId);
      if (!templateItem) {
        return reply
          .code(400)
          .send({ message: `Item inválido: ${inputItem.templateItemId} não pertence ao modelo` });
      }

      validateByType(templateItem.itemType, inputItem);

      if (isProblem(templateItem.itemType, inputItem)) {
        if (templateItem.requiresObservationOnProblem && !inputItem.observation?.trim()) {
          return reply
            .code(400)
            .send({ message: `Observação obrigatória para problema no item "${templateItem.label}"` });
        }

        if (
          templateItem.requiresPhotoOnProblem &&
          (!inputItem.attachmentIds || inputItem.attachmentIds.length === 0)
        ) {
          return reply
            .code(400)
            .send({ message: `Foto obrigatória para problema no item "${templateItem.label}"` });
        }
      }
    }

    const hadProblem = body.items.some((item) => {
      const templateItem = mapById.get(item.templateItemId)!;
      return isProblem(templateItem.itemType, item);
    });

    const execution = await prisma.$transaction(async (tx) => {
      const createdExecution = await tx.checklistExecution.create({
        data: {
          templateId: body.templateId,
          equipmentId: body.equipmentId,
          employeeId: body.employeeId,
          monthReference: body.monthReference,
          operatorName: body.operatorName,
          secondaryOperatorName: body.secondaryOperatorName,
          hourmeterValue: body.hourmeterValue,
          mileageValue: body.mileageValue,
          workingHoursStartMonth: body.workingHoursStartMonth,
          fuelLevel: body.fuelLevel,
          notes: body.notes,
          hadProblem
        }
      });

      for (const inputItem of body.items) {
        const templateItem = mapById.get(inputItem.templateItemId)!;
        const problem = isProblem(templateItem.itemType, inputItem);

        await tx.checklistExecutionItem.create({
          data: {
            executionId: createdExecution.id,
            templateItemId: inputItem.templateItemId,
            optionResult: inputItem.optionResult,
            booleanResult: inputItem.booleanResult,
            numericValue: inputItem.numericValue,
            textValue: inputItem.textValue,
            observation: inputItem.observation,
            hadProblem: problem,
            attachments: inputItem.attachmentIds
              ? { connect: inputItem.attachmentIds.map((id) => ({ id })) }
              : undefined
          }
        });

        if (templateItem.opensMaintenanceOnProblem && problem) {
          await tx.maintenance.create({
            data: {
              equipmentId: body.equipmentId,
              checklistExecutionId: createdExecution.id,
              type: MaintenanceType.CORRETIVA,
              priority: MaintenancePriority.ALTA,
              status: MaintenanceStatus.ABERTA,
              description: `[Checklist] ${templateItem.label}`,
              cause: inputItem.observation
            }
          });
        }
      }

      return tx.checklistExecution.findUniqueOrThrow({
        where: { id: createdExecution.id },
        include: {
          template: true,
          equipment: true,
          employee: true,
          items: { include: { templateItem: true, attachments: true } },
          maintenances: true
        }
      });
    });

    return reply.code(201).send(execution);
  });
}
