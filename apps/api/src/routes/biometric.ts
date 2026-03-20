import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function biometricRoutes(app: FastifyInstance) {
  app.post("/biometric/identify", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      employeeId: z.string().cuid()
    }).parse(request.body);

    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId }
    });

    if (!employee) {
      return reply.code(404).send({ message: "Funcionário não encontrado" });
    }

    return {
      employee
    };
  });
}
