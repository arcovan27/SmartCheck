import type { FastifyInstance } from "fastify";
import { EquipmentType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/equipments", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        type: z.nativeEnum(EquipmentType).optional(),
        department: z.string().optional(),
        isActive: z
          .string()
          .optional()
          .transform((value) => {
            if (value === undefined) return undefined;
            return value === "true";
          })
      })
      .parse(request.query);

    return prisma.equipment.findMany({
      where: {
        type: query.type,
        isActive: query.isActive,
        department: query.department ? { contains: query.department, mode: "insensitive" } : undefined,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { serialNumber: { contains: query.search, mode: "insensitive" } },
              { assetTag: { contains: query.search, mode: "insensitive" } }
            ]
          : undefined
      },
      orderBy: { name: "asc" }
    });
  });

  app.get("/equipments/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      include: {
        maintenances: {
          orderBy: { openedAt: "desc" },
          take: 10
        },
        checklistExecutions: {
          orderBy: { executedAt: "desc" },
          take: 10,
          include: { template: true, employee: true }
        }
      }
    });

    if (!equipment) {
      return reply.code(404).send({ message: "Equipamento não encontrado" });
    }

    return equipment;
  });

  app.post("/equipments", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        type: z.nativeEnum(EquipmentType),
        department: z.string().min(1),
        model: z.string().optional().nullable(),
        serialNumber: z.string().optional().nullable(),
        hourmeter: z.number().optional().nullable(),
        mileage: z.number().optional().nullable(),
        manufacturer: z.string().optional().nullable(),
        assetTag: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    const equipment = await prisma.equipment.create({
      data: {
        ...body,
        isActive: body.isActive ?? true
      }
    });

    return reply.code(201).send(equipment);
  });

  app.patch("/equipments/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(2).optional(),
        type: z.nativeEnum(EquipmentType).optional(),
        department: z.string().min(1).optional(),
        model: z.string().optional().nullable(),
        serialNumber: z.string().optional().nullable(),
        hourmeter: z.number().optional().nullable(),
        mileage: z.number().optional().nullable(),
        manufacturer: z.string().optional().nullable(),
        assetTag: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    return prisma.equipment.update({
      where: { id: params.id },
      data: body
    });
  });

  app.delete("/equipments/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      select: { id: true, name: true }
    });

    if (!equipment) {
      return reply.code(404).send({ message: "Equipamento não encontrado" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const executions = await tx.checklistExecution.findMany({
          where: { equipmentId: params.id },
          select: { id: true }
        });
        const executionIds = executions.map((execution) => execution.id);

        await tx.attachment.deleteMany({
          where: {
            maintenance: {
              equipmentId: params.id
            }
          }
        });

        if (executionIds.length) {
          await tx.attachment.deleteMany({
            where: {
              checklistExecutionItem: {
                executionId: {
                  in: executionIds
                }
              }
            }
          });
        }

        await tx.maintenance.deleteMany({ where: { equipmentId: params.id } });

        if (executionIds.length) {
          await tx.checklistExecutionItem.deleteMany({
            where: {
              executionId: {
                in: executionIds
              }
            }
          });

          await tx.checklistExecution.deleteMany({
            where: {
              id: {
                in: executionIds
              }
            }
          });
        }

        await tx.checklistTemplate.updateMany({
          where: { equipmentId: params.id },
          data: { equipmentId: null }
        });
        await tx.maintenancePlan.deleteMany({ where: { equipmentId: params.id } });
        await tx.equipment.delete({ where: { id: params.id } });
      });

      return reply.send({
        message: `Equipamento "${equipment.name}" e histórico vinculado apagados com sucesso. Modelos de checklist foram preservados para reutilização.`
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.code(404).send({ message: "Equipamento não encontrado" });
        }
        if (error.code === "P2003") {
          return reply
            .code(409)
            .send({ message: "Não foi possível apagar tudo: ainda existe vínculo com outros registros." });
        }
      }
      throw error;
    }
  });
}
