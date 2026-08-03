import type { FastifyInstance } from "fastify";
import {
  ChecklistItemType,
  ChecklistOptionResult,
  ChecklistPeriodicity,
  ChecklistReadingMode,
  ChecklistTemplateCode,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
  Prisma,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import {
  checklistReadingsForResponse,
  validateChecklistReadings,
  validateReadingProgression
} from "../services/checklistReadings.js";

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
              OR: [
                {
                  equipmentLinks: {
                    some: { equipmentId: query.equipmentId }
                  }
                },
                { equipmentId: query.equipmentId }
              ]
            }
          : {}),
        isActive: query.isActive
      },
      include: {
        equipment: true,
        equipmentLinks: {
          include: { equipment: true },
          orderBy: { equipmentId: "asc" }
        },
        items: { orderBy: { position: "asc" } }
      },
      orderBy: { name: "asc" }
    });
  });

  app.post("/checklist-templates", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN || request.user.checklistOnly) {
      return reply.code(403).send({ message: "Somente administradores podem cadastrar modelos de checklist." });
    }

    const body = z
      .object({
        name: z.string().min(2),
        code: z.nativeEnum(ChecklistTemplateCode).optional(),
        description: z.string().optional().nullable(),
        periodicity: z.nativeEnum(ChecklistPeriodicity),
        readingMode: z.nativeEnum(ChecklistReadingMode).optional(),
        equipmentIds: z.array(z.string().cuid()).min(1),
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
        readingMode: body.readingMode ?? ChecklistReadingMode.NONE,
        equipmentId: body.equipmentIds[0] ?? null,
        isActive: body.isActive ?? true,
        equipmentLinks: {
          create: body.equipmentIds.map((equipmentId) => ({ equipmentId }))
        },
        items: {
          create: body.items
        }
      },
      include: {
        equipment: true,
        equipmentLinks: {
          include: { equipment: true },
          orderBy: { equipmentId: "asc" }
        },
        items: { orderBy: { position: "asc" } }
      }
    });

    return reply.code(201).send(template);
  });

  app.patch("/checklist-templates/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN || request.user.checklistOnly) {
      return reply.code(403).send({ message: "Somente administradores podem editar modelos de checklist." });
    }

    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const body = z
      .object({
        name: z.string().min(2).optional(),
        code: z.nativeEnum(ChecklistTemplateCode).optional(),
        description: z.string().optional().nullable(),
        periodicity: z.nativeEnum(ChecklistPeriodicity).optional(),
        readingMode: z.nativeEnum(ChecklistReadingMode).optional(),
        equipmentIds: z.array(z.string().cuid()).min(1).optional(),
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
          readingMode: body.readingMode,
          equipmentId: body.equipmentIds?.[0] ?? undefined,
          isActive: body.isActive
        }
      });

      if (body.equipmentIds) {
        await tx.checklistTemplateEquipment.deleteMany({
          where: {
            templateId: params.id,
            equipmentId: { notIn: body.equipmentIds }
          }
        });

        await tx.checklistTemplateEquipment.createMany({
          data: body.equipmentIds.map((equipmentId) => ({
            templateId: params.id,
            equipmentId
          })),
          skipDuplicates: true
        });
      }

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
          equipmentLinks: {
            include: { equipment: true },
            orderBy: { equipmentId: "asc" }
          },
          items: { orderBy: { position: "asc" } }
        }
      });
    });
  });

  app.delete("/checklist-templates/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN || request.user.checklistOnly) {
      return reply.code(403).send({ message: "Somente administradores podem apagar modelos de checklist." });
    }

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

    const executions = await prisma.checklistExecution.findMany({
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

    return executions.map((execution) => ({
      ...execution,
      readings: checklistReadingsForResponse(execution)
    }));
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
        hourmeterValue: z
          .number({ invalid_type_error: "Horimetro atual deve ser numerico." })
          .optional()
          .nullable(),
        mileageValue: z
          .number({ invalid_type_error: "Quilometragem atual deve ser numerica." })
          .optional()
          .nullable(),
        workingHoursStartMonth: z.number().optional().nullable(),
        fuelLevel: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        items: z.array(executionItemSchema).min(1)
      })
      .parse(request.body);

    if (!request.user.employeeId || request.user.employeeId !== body.employeeId) {
      return reply.code(403).send({ message: "A execucao deve ser registrada pelo funcionario autenticado." });
    }

    const authenticatedEmployee = await prisma.employee.findUnique({
      where: { id: request.user.employeeId },
      select: { isActive: true, department: true, departmentRef: { select: { name: true } } }
    });
    if (!authenticatedEmployee?.isActive) {
      return reply.code(403).send({ message: "O funcionario autenticado esta inativo ou nao foi encontrado." });
    }

    const template = await prisma.checklistTemplate.findUnique({
      where: { id: body.templateId },
      include: {
        items: true,
        equipmentLinks: { select: { equipmentId: true } }
      }
    });

    if (!template) {
      return reply.code(404).send({ message: "Modelo de checklist não encontrado" });
    }

    const isLinkedToEquipment =
      template.equipmentId === body.equipmentId ||
      template.equipmentLinks.some((link) => link.equipmentId === body.equipmentId);
    if (!isLinkedToEquipment) {
      return reply.code(400).send({ message: "O checklist selecionado nao esta vinculado a este equipamento." });
    }

    const readings = validateChecklistReadings(template.readingMode, body);

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
      await tx.$queryRaw`
        SELECT "id"
        FROM "Equipment"
        WHERE "id" = ${body.equipmentId}
        FOR UPDATE
      `;

      const [equipment, lastHourmeterExecution, lastMileageExecution] = await Promise.all([
        tx.equipment.findUnique({
          where: { id: body.equipmentId },
          select: { hourmeter: true, mileage: true }
        }),
        tx.checklistExecution.findFirst({
          where: { equipmentId: body.equipmentId, hourmeterValue: { not: null } },
          select: { hourmeterValue: true },
          orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }]
        }),
        tx.checklistExecution.findFirst({
          where: { equipmentId: body.equipmentId, mileageValue: { not: null } },
          select: { mileageValue: true },
          orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }]
        })
      ]);

      if (!equipment) {
        throw new Error("Equipamento nao encontrado.");
      }

      validateReadingProgression("Horimetro atual", readings.hourmeterValue, [
        equipment.hourmeter,
        lastHourmeterExecution?.hourmeterValue
      ]);
      validateReadingProgression("Quilometragem atual", readings.mileageValue, [
        equipment.mileage,
        lastMileageExecution?.mileageValue
      ]);

      const createdExecution = await tx.checklistExecution.create({
        data: {
          templateId: body.templateId,
          equipmentId: body.equipmentId,
          employeeId: body.employeeId,
          departmentNameSnapshot: authenticatedEmployee.departmentRef?.name ?? authenticatedEmployee.department,
          readingMode: template.readingMode,
          monthReference: body.monthReference,
          operatorName: body.operatorName,
          secondaryOperatorName: body.secondaryOperatorName,
          hourmeterValue: readings.hourmeterValue,
          mileageValue: readings.mileageValue,
          workingHoursStartMonth: body.workingHoursStartMonth,
          fuelLevel: body.fuelLevel,
          notes: body.notes,
          hadProblem
        }
      });

      if (readings.hourmeterValue !== null || readings.mileageValue !== null) {
        await tx.equipment.update({
          where: { id: body.equipmentId },
          data: {
            hourmeter: readings.hourmeterValue ?? undefined,
            mileage: readings.mileageValue ?? undefined
          }
        });
      }

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

    return reply.code(201).send({
      ...execution,
      readings: checklistReadingsForResponse(execution)
    });
  });
}
