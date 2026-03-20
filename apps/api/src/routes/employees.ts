import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function employeeRoutes(app: FastifyInstance) {
  app.get("/employees", { preHandler: [app.authenticate] }, async () => {
    return prisma.employee.findMany({
      orderBy: { name: "asc" }
    });
  });

  app.post("/employees", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(2),
      registration: z.string().min(1),
      department: z.string().min(1),
      function: z.string().min(1),
      active: z.boolean().optional(),
      biometricTemplate: z.string().optional().nullable()
    }).parse(request.body);

    const employee = await prisma.employee.create({ data: body });
    return reply.code(201).send(employee);
  });

  app.patch("/employees/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(2).optional(),
      registration: z.string().min(1).optional(),
      department: z.string().min(1).optional(),
      function: z.string().min(1).optional(),
      active: z.boolean().optional(),
      biometricTemplate: z.string().optional().nullable()
    }).parse(request.body);

    return prisma.employee.update({ where: { id: params.id }, data: body });
  });
}
