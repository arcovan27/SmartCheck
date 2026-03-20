import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/equipments", { preHandler: [app.authenticate] }, async () => {
    return prisma.equipment.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/equipments", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(2),
      type: z.string().min(1),
      department: z.string().min(1),
      model: z.string().optional().nullable(),
      serialNumber: z.string().optional().nullable(),
      hourmeter: z.number().optional().nullable(),
      mileage: z.number().optional().nullable(),
      active: z.boolean().optional()
    }).parse(request.body);

    const equipment = await prisma.equipment.create({ data: body });
    return reply.code(201).send(equipment);
  });

  app.patch("/equipments/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(2).optional(),
      type: z.string().min(1).optional(),
      department: z.string().min(1).optional(),
      model: z.string().optional().nullable(),
      serialNumber: z.string().optional().nullable(),
      hourmeter: z.number().optional().nullable(),
      mileage: z.number().optional().nullable(),
      active: z.boolean().optional()
    }).parse(request.body);

    return prisma.equipment.update({ where: { id: params.id }, data: body });
  });
}
