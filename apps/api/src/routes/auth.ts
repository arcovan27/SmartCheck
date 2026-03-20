import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(4)
    }).parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { employee: true }
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ message: "Credenciais inválidas" });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ message: "Credenciais inválidas" });
    }

    const token = await reply.jwtSign({
      id: user.id,
      employeeId: user.employeeId,
      role: user.role,
      email: user.email
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee: user.employee
      }
    };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { employee: true }
    });

    return {
      id: user?.id,
      email: user?.email,
      role: user?.role,
      employee: user?.employee
    };
  });

  app.post("/users", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Apenas admin" });
    }

    const body = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      role: z.nativeEnum(UserRole),
      employeeId: z.string().cuid()
    }).parse(request.body);

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: body.role,
        employeeId: body.employeeId
      }
    });

    return reply.code(201).send(user);
  });
}
