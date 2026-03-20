import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function epiRoutes(app: FastifyInstance) {
  app.get("/epis", { preHandler: [app.authenticate] }, async () => {
    return prisma.epi.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/epis", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      active: z.boolean().optional()
    }).parse(request.body);

    const epi = await prisma.epi.create({ data: body });
    return reply.code(201).send(epi);
  });

  app.get("/epi-deliveries", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({
      employeeId: z.string().cuid().optional()
    }).parse(request.query);

    return prisma.epiDelivery.findMany({
      where: query.employeeId ? { employeeId: query.employeeId } : undefined,
      include: {
        employee: true,
        epi: true,
        deliveredByUser: true,
        attachments: true
      },
      orderBy: { deliveredAt: "desc" }
    });
  });

  app.post("/epi-deliveries", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      employeeId: z.string().cuid(),
      epiId: z.string().cuid(),
      quantity: z.number().int().positive(),
      caNumber: z.string().min(1),
      deliveredAt: z.coerce.date(),
      notes: z.string().optional().nullable(),
      attachmentIds: z.array(z.string().cuid()).optional()
    }).parse(request.body);

    const delivery = await prisma.epiDelivery.create({
      data: {
        employeeId: body.employeeId,
        epiId: body.epiId,
        quantity: body.quantity,
        caNumber: body.caNumber,
        deliveredAt: body.deliveredAt,
        notes: body.notes,
        deliveredByUserId: request.user.id,
        attachments: body.attachmentIds
          ? {
              connect: body.attachmentIds.map((id) => ({ id }))
            }
          : undefined
      },
      include: { employee: true, epi: true, attachments: true }
    });

    return reply.code(201).send(delivery);
  });

  app.get("/reports/epi-by-employee/:employeeId", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ employeeId: z.string().cuid() }).parse(request.params);

    const employee = await prisma.employee.findUnique({ where: { id: params.employeeId } });
    const deliveries = await prisma.epiDelivery.findMany({
      where: { employeeId: params.employeeId },
      include: { epi: true, deliveredByUser: true },
      orderBy: { deliveredAt: "desc" }
    });

    return { employee, deliveries };
  });
}
