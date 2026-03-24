import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { BiometricStatus, EmployeeOccurrenceType, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function employeeRoutes(app: FastifyInstance) {
  app.get("/employees", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        name: z.string().optional(),
        registration: z.string().optional(),
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

    return prisma.employee.findMany({
      where: {
        isActive: query.isActive,
        name: query.name ? { contains: query.name, mode: "insensitive" } : undefined,
        registration: query.registration
          ? { contains: query.registration, mode: "insensitive" }
          : undefined,
        department: query.department ? { contains: query.department, mode: "insensitive" } : undefined
      },
      include: {
        user: true,
        biometric: true
      },
      orderBy: { name: "asc" }
    });
  });

  app.get("/employees/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        biometric: true,
        epiMovements: {
          include: { epi: true, responsibleUser: true },
          orderBy: { date: "desc" },
          take: 30
        },
        checklistExecutions: {
          include: { equipment: true, template: true },
          orderBy: { executedAt: "desc" },
          take: 30
        },
        maintenances: {
          include: { equipment: true, checklistExecution: true },
          orderBy: { openedAt: "desc" },
          take: 30
        },
        occurrences: {
          orderBy: { date: "desc" },
          take: 100
        }
      }
    });

    if (!employee) {
      return reply.code(404).send({ message: "Funcionário não encontrado" });
    }

    const relatedChecklistMaintenances = await prisma.maintenance.findMany({
      where: {
        checklistExecution: {
          employeeId: employee.id
        }
      },
      include: {
        equipment: true,
        checklistExecution: true
      },
      orderBy: { openedAt: "desc" },
      take: 30
    });

    return {
      ...employee,
      biometricStatus: employee.biometric?.status ?? BiometricStatus.SEM_BIOMETRIA,
      relatedChecklistMaintenances
    };
  });

  app.post("/employees", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(3),
        registration: z.string().min(1),
        cpf: z.string().optional().nullable(),
        department: z.string().min(1),
        position: z.string().min(1),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        photoPath: z.string().optional().nullable(),
        admissionDate: z.coerce.date().optional().nullable(),
        dismissalDate: z.coerce.date().optional().nullable(),
        isActive: z.boolean().optional(),
        notes: z.string().optional().nullable(),
        userId: z.string().cuid().optional().nullable(),
        userAccess: z
          .object({
            enabled: z.boolean(),
            email: z.string().email().optional(),
            password: z.string().min(6).optional(),
            role: z.nativeEnum(UserRole).optional(),
            isActive: z.boolean().optional()
          })
          .optional()
      })
      .parse(request.body);

    const employee = await prisma.$transaction(async (tx) => {
      const createdEmployee = await tx.employee.create({
        data: {
          name: body.name,
          registration: body.registration,
          cpf: body.cpf,
          department: body.department,
          position: body.position,
          phone: body.phone,
          email: body.email,
          photoPath: body.photoPath,
          admissionDate: body.admissionDate,
          dismissalDate: body.dismissalDate,
          isActive: body.isActive ?? true,
          notes: body.notes,
          user: body.userId ? { connect: { id: body.userId } } : undefined
        }
      });

      if (body.userAccess?.enabled) {
        if (!body.userAccess.email || !body.userAccess.password || !body.userAccess.role) {
          throw new Error("Para liberar acesso ao sistema, informe e-mail, senha e perfil.");
        }
        const passwordHash = await bcrypt.hash(body.userAccess.password, 10);
        await tx.user.create({
          data: {
            email: body.userAccess.email,
            passwordHash,
            role: body.userAccess.role,
            isActive: body.userAccess.isActive ?? true,
            employeeId: createdEmployee.id
          }
        });
      }

      return tx.employee.findUniqueOrThrow({
        where: { id: createdEmployee.id },
        include: { user: true, biometric: true }
      });
    });

    return reply.code(201).send(employee);
  });

  app.patch("/employees/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(3).optional(),
        registration: z.string().min(1).optional(),
        cpf: z.string().optional().nullable(),
        department: z.string().min(1).optional(),
        position: z.string().min(1).optional(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        photoPath: z.string().optional().nullable(),
        admissionDate: z.coerce.date().optional().nullable(),
        dismissalDate: z.coerce.date().optional().nullable(),
        isActive: z.boolean().optional(),
        notes: z.string().optional().nullable(),
        userId: z.string().cuid().optional().nullable(),
        userAccess: z
          .object({
            enabled: z.boolean(),
            email: z.string().email().optional(),
            password: z.string().min(6).optional(),
            role: z.nativeEnum(UserRole).optional(),
            isActive: z.boolean().optional()
          })
          .optional()
      })
      .parse(request.body);

    return prisma.$transaction(async (tx) => {
      const existingEmployee = await tx.employee.findUnique({
        where: { id: params.id },
        include: { user: true }
      });
      if (!existingEmployee) throw new Error("Funcionario nao encontrado.");

      await tx.employee.update({
        where: { id: params.id },
        data: {
          name: body.name,
          registration: body.registration,
          cpf: body.cpf,
          department: body.department,
          position: body.position,
          phone: body.phone,
          email: body.email,
          photoPath: body.photoPath,
          admissionDate: body.admissionDate,
          dismissalDate: body.dismissalDate,
          isActive: body.isActive,
          notes: body.notes,
          user:
            body.userAccess !== undefined
              ? undefined
              : body.userId === undefined
                ? undefined
                : body.userId
                  ? { connect: { id: body.userId } }
                  : { disconnect: true }
        }
      });

      if (body.userAccess !== undefined) {
        if (body.userAccess.enabled) {
          if (existingEmployee.user) {
            const updateData: Prisma.UserUpdateInput = {
              email: body.userAccess.email ?? existingEmployee.user.email,
              role: body.userAccess.role ?? existingEmployee.user.role,
              isActive: body.userAccess.isActive ?? existingEmployee.user.isActive,
              employee: { connect: { id: params.id } }
            };
            if (body.userAccess.password) {
              updateData.passwordHash = await bcrypt.hash(body.userAccess.password, 10);
            }
            await tx.user.update({
              where: { id: existingEmployee.user.id },
              data: updateData
            });
          } else {
            if (!body.userAccess.email || !body.userAccess.password || !body.userAccess.role) {
              throw new Error("Para liberar acesso ao sistema, informe e-mail, senha e perfil.");
            }
            const passwordHash = await bcrypt.hash(body.userAccess.password, 10);
            await tx.user.create({
              data: {
                email: body.userAccess.email,
                passwordHash,
                role: body.userAccess.role,
                isActive: body.userAccess.isActive ?? true,
                employeeId: params.id
              }
            });
          }
        } else if (existingEmployee.user) {
          await tx.user.update({
            where: { id: existingEmployee.user.id },
            data: {
              isActive: false,
              employeeId: null
            }
          });
        }
      }

      return tx.employee.findUniqueOrThrow({
        where: { id: params.id },
        include: { user: true, biometric: true }
      });
    });
  });

  app.patch("/employees/:id/status", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ isActive: z.boolean() }).parse(request.body);

    return prisma.employee.update({
      where: { id: params.id },
      data: { isActive: body.isActive }
    });
  });

  app.delete("/employees/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        biometric: true,
        epiMovements: { select: { id: true }, take: 1 },
        checklistExecutions: { select: { id: true }, take: 1 },
        maintenances: { select: { id: true }, take: 1 },
        occurrences: { select: { id: true }, take: 1 }
      }
    });

    if (!employee) {
      return reply.code(404).send({ message: "Funcionário não encontrado" });
    }

    if (employee.isActive) {
      return reply.code(400).send({ message: "Inative o funcionário antes de excluir" });
    }

    const blockingReasons: string[] = [];

    if (employee.user) {
      blockingReasons.push("possui usuário vinculado");
    }

    if (
      employee.epiMovements.length ||
      employee.checklistExecutions.length ||
      employee.maintenances.length ||
      employee.occurrences.length
    ) {
      blockingReasons.push("possui histórico operacional");
    }

    if (blockingReasons.length > 0) {
      return reply.code(400).send({
        message: `Não foi possível excluir: ${blockingReasons.join(" e ")}.`,
        details: {
          hasUser: Boolean(employee.user),
          epiMovements: employee.epiMovements.length,
          checklistExecutions: employee.checklistExecutions.length,
          maintenances: employee.maintenances.length,
          occurrences: employee.occurrences.length
        }
      });
    }

    try {
      if (employee.biometric) {
        await prisma.employeeBiometric.delete({ where: { employeeId: employee.id } });
      }

      await prisma.employee.delete({ where: { id: employee.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.code(400).send({
          message: "Não foi possível excluir porque este funcionário ainda possui vínculos com outros registros."
        });
      }

      throw error;
    }

    return { message: "Funcionário excluído com sucesso" };
  });

  app.post("/employees/:id/occurrences", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        type: z.nativeEnum(EmployeeOccurrenceType),
        date: z.coerce.date(),
        description: z.string().min(3),
        daysAway: z.number().int().min(0).optional().nullable(),
        notes: z.string().optional().nullable(),
        attachmentPath: z.string().optional().nullable(),
        attachmentMimeType: z.string().optional().nullable(),
        attachmentFilename: z.string().optional().nullable()
      })
      .parse(request.body);

    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      select: { id: true }
    });

    if (!employee) {
      return reply.code(404).send({ message: "Funcionario nao encontrado" });
    }

    const occurrence = await prisma.employeeOccurrence.create({
      data: {
        employeeId: params.id,
        type: body.type,
        date: body.date,
        description: body.description,
        daysAway: body.daysAway ?? null,
        notes: body.notes ?? null,
        attachmentPath: body.attachmentPath ?? null,
        attachmentMimeType: body.attachmentMimeType ?? null,
        attachmentFilename: body.attachmentFilename ?? null
      }
    });

    return reply.code(201).send(occurrence);
  });

  app.delete(
    "/employees/:id/occurrences/:occurrenceId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().cuid(),
          occurrenceId: z.string().cuid()
        })
        .parse(request.params);

      const occurrence = await prisma.employeeOccurrence.findUnique({
        where: { id: params.occurrenceId },
        select: { id: true, employeeId: true }
      });

      if (!occurrence || occurrence.employeeId !== params.id) {
        return reply.code(404).send({ message: "Ocorrencia nao encontrada para este funcionario" });
      }

      await prisma.employeeOccurrence.delete({ where: { id: params.occurrenceId } });
      return reply.send({ message: "Ocorrencia removida com sucesso" });
    }
  );
}


