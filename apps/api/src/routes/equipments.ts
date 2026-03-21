import type { FastifyInstance } from "fastify";
import { EquipmentType } from "@prisma/client";
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
}
