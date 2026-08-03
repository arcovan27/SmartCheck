import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { listHrPermissions, publicUserSelect } from "../services/hrAccess.js";

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
      email: user.email,
      checklistOnly: false,
      tokenType: "SESSION"
    });

    const permissions = await listHrPermissions(user.role);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        employee: user.employee,
        permissions
      }
    };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.checklistOnly) {
      if (!request.user.employeeId) {
        return reply.code(401).send({ message: "Token de checklist invalido" });
      }

      const employee = await prisma.employee.findUnique({
        where: { id: request.user.employeeId }
      });

      if (!employee || !employee.isActive) {
        return reply.code(401).send({ message: "Funcionario vinculado ao link esta inativo" });
      }

      return {
        id: request.user.id,
        email: request.user.email,
        role: request.user.role,
        isActive: true,
        checklistOnly: true,
        employee
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { employee: true }
    });

    if (!user) {
      return reply.code(404).send({ message: "Usuário não encontrado" });
    }

    const permissions = await listHrPermissions(user.role);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      checklistOnly: false,
      employee: user.employee,
      permissions
    };
  });

  app.post("/auth/checklist-access-link", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem gerar link de checklist" });
    }

    const body = z
      .object({
        employeeId: z.string().cuid()
      })
      .parse(request.body);

    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId }
    });
    if (!employee || !employee.isActive) {
      return reply.code(404).send({ message: "Funcionario nao encontrado ou inativo" });
    }

    const token = await reply.jwtSign(
      {
        id: `checklist-link:${employee.id}`,
        employeeId: employee.id,
        role: UserRole.OPERADOR,
        email: employee.email ?? `checklist+${employee.registration}@smartcheck.local`,
        checklistOnly: true,
        tokenType: "CHECKLIST_LINK"
      }
    );

    return {
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        registration: employee.registration
      }
    };
  });

  app.post("/auth/checklist-link-login", async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(20)
      })
      .parse(request.body);

    let payload: any;
    try {
      payload = await app.jwt.verify(body.token);
    } catch {
      return reply.code(401).send({ message: "Link invalido ou expirado" });
    }

    if (!payload?.checklistOnly || payload?.tokenType !== "CHECKLIST_LINK" || !payload?.employeeId) {
      return reply.code(401).send({ message: "Link invalido para acesso de checklist" });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId }
    });
    if (!employee || !employee.isActive) {
      return reply.code(401).send({ message: "Funcionario vinculado ao link esta inativo" });
    }

    const sessionToken = await reply.jwtSign(
      {
        id: `checklist-session:${employee.id}`,
        employeeId: employee.id,
        role: UserRole.OPERADOR,
        email: employee.email ?? `checklist+${employee.registration}@smartcheck.local`,
        checklistOnly: true,
        tokenType: "SESSION"
      }
    );

    return {
      token: sessionToken,
      user: {
        id: `checklist-session:${employee.id}`,
        email: employee.email ?? `checklist+${employee.registration}@smartcheck.local`,
        role: UserRole.OPERADOR,
        isActive: true,
        checklistOnly: true,
        employee
      }
    };
  });

  app.get("/users", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ message: "Somente administradores podem listar usuários" });
    }

    return prisma.user.findMany({
      select: {
        ...publicUserSelect,
        employee: { select: { id: true, name: true, registration: true, isActive: true } },
        companyAccess: { select: { company: { select: { id: true, legalName: true, tradeName: true } } } },
        unitAccess: { select: { unit: { select: { id: true, name: true, companyId: true } } } }
      },
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
      select: { ...publicUserSelect, employee: { select: { id: true, name: true, registration: true, isActive: true } } }
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
      select: { ...publicUserSelect, employee: { select: { id: true, name: true, registration: true, isActive: true } } }
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
