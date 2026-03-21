import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
  employeeId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional()
});

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  employeeId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional()
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(4)
      })
      .parse(request.body);

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
      employeeId: user.employeeId ?? null,
      role: user.role,
      email: user.email
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        employee: user.employee
      }
    };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { employee: true }
    });

    if (!user) {
      return reply.code(404).send({ message: "Usuário não encontrado" });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      employee: user.employee
    };
  });

  app.get("/users", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem listar usuários" });
    }

    return prisma.user.findMany({
      include: { employee: true },
      orderBy: { createdAt: "desc" }
    });
  });

  app.post("/users", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem criar usuários" });
    }

    const body = userCreateSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: body.role,
        employeeId: body.employeeId,
        isActive: body.isActive ?? true
      },
      include: { employee: true }
    });

    return reply.code(201).send(user);
  });

  app.patch("/users/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem editar usuários" });
    }

    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = userUpdateSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: params.id },
      data: body,
      include: { employee: true }
    });

    return user;
  });

  app.post("/users/:id/reset-password", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem redefinir senha" });
    }

    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        password: z.string().min(6)
      })
      .parse(request.body);

    const passwordHash = await bcrypt.hash(body.password, 10);

    await prisma.user.update({
      where: { id: params.id },
      data: { passwordHash }
    });

    return { message: "Senha redefinida com sucesso" };
  });
}
