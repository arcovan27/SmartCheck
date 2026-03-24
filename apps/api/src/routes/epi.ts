import type { FastifyInstance } from "fastify";
import { ConfirmationMethod, EpiMovementType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function epiRoutes(app: FastifyInstance) {
  app.get("/epis", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        isActive: z
          .string()
          .optional()
          .transform((value) => {
            if (value === undefined) return undefined;
            return value === "true";
          })
      })
      .parse(request.query);

    return prisma.epi.findMany({
      where: {
        isActive: query.isActive,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: "insensitive" } },
              { category: { contains: query.search, mode: "insensitive" } },
              { ca: { contains: query.search, mode: "insensitive" } }
            ]
          : undefined
      },
      orderBy: { name: "asc" }
    });
  });

  app.get("/epis/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const epi = await prisma.epi.findUnique({
      where: { id: params.id },
      include: {
        movements: {
          include: { employee: true, responsibleUser: true },
          orderBy: { date: "desc" },
          take: 50
        }
      }
    });

    if (!epi) {
      return reply.code(404).send({ message: "EPI não encontrado" });
    }

    return epi;
  });

  app.post("/epis", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().optional().nullable(),
        ca: z.string().min(1),
        category: z.string().min(1),
        validityDate: z.coerce.date().optional().nullable(),
        unit: z.string().min(1),
        purchasePrice: z.number().min(0).optional().nullable(),
        stock: z.number().int().min(0),
        minimumStock: z.number().int().min(0),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    const epi = await prisma.epi.create({
      data: {
        ...body,
        isActive: body.isActive ?? true
      }
    });

    return reply.code(201).send(epi);
  });

  app.patch("/epis/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(2).optional(),
        description: z.string().optional().nullable(),
        ca: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        validityDate: z.coerce.date().optional().nullable(),
        unit: z.string().min(1).optional(),
        purchasePrice: z.number().min(0).optional().nullable(),
        stock: z.number().int().min(0).optional(),
        minimumStock: z.number().int().min(0).optional(),
        isActive: z.boolean().optional()
      })
      .parse(request.body);

    return prisma.epi.update({
      where: { id: params.id },
      data: body
    });
  });

  app.delete("/epis/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    try {
      await prisma.epi.delete({
        where: { id: params.id }
      });
      return reply.send({ message: "EPI apagado com sucesso" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.code(404).send({ message: "EPI nao encontrado" });
        }
        if (error.code === "P2003") {
          return reply
            .code(409)
            .send({ message: "Nao e possivel apagar: este EPI possui movimentacoes registradas" });
        }
      }

      throw error;
    }
  });

  app.get("/epi-deliveries", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        employeeId: z.string().cuid().optional(),
        epiId: z.string().cuid().optional(),
        movementType: z.nativeEnum(EpiMovementType).optional()
      })
      .parse(request.query);

    return prisma.epiDelivery.findMany({
      where: {
        employeeId: query.employeeId,
        epiId: query.epiId,
        movementType: query.movementType
      },
      include: {
        employee: true,
        epi: true,
        responsibleUser: {
          include: { employee: true }
        },
        attachments: true
      },
      orderBy: { date: "desc" }
    });
  });

  app.post("/epi-deliveries", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        employeeId: z.string().cuid(),
        epiId: z.string().cuid(),
        movementType: z.nativeEnum(EpiMovementType).default(EpiMovementType.ENTREGA),
        quantity: z.number().int().positive(),
        date: z.coerce.date().optional(),
        notes: z.string().optional().nullable(),
        confirmationMethod: z.nativeEnum(ConfirmationMethod),
        confirmationBiometricId: z.string().optional().nullable(),
        employeeSignatureName: z.string().min(2),
        employeeConfirmedAt: z.coerce.date().optional().nullable(),
        attachmentIds: z.array(z.string().cuid()).optional()
      })
      .parse(request.body);

    if (body.confirmationMethod === ConfirmationMethod.BIOMETRIA && !body.confirmationBiometricId) {
      return reply
        .code(400)
        .send({ message: "confirmationBiometricId é obrigatório quando confirmação for por biometria" });
    }

    const delivery = await prisma.$transaction(async (tx) => {
      const epi = await tx.epi.findUniqueOrThrow({ where: { id: body.epiId } });
      const nextStock =
        body.movementType === EpiMovementType.ENTREGA ? epi.stock - body.quantity : epi.stock + body.quantity;

      if (nextStock < 0) {
        throw new Error("Estoque insuficiente para esta entrega");
      }

      await tx.epi.update({
        where: { id: body.epiId },
        data: { stock: nextStock }
      });

      return tx.epiDelivery.create({
        data: {
          employeeId: body.employeeId,
          epiId: body.epiId,
          movementType: body.movementType,
          quantity: body.quantity,
          date: body.date ?? new Date(),
          responsibleUserId: request.user.id,
          notes: body.notes,
          confirmationMethod: body.confirmationMethod,
          confirmationBiometricId: body.confirmationBiometricId,
          employeeSignatureName: body.employeeSignatureName,
          employeeConfirmedAt: body.employeeConfirmedAt ?? new Date(),
          attachments: body.attachmentIds
            ? { connect: body.attachmentIds.map((id) => ({ id })) }
            : undefined
        },
        include: {
          employee: true,
          epi: true,
          responsibleUser: {
            include: { employee: true }
          },
          attachments: true
        }
      });
    });

    return reply.code(201).send(delivery);
  });

  app.get(
    "/reports/epi-by-employee/:employeeId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ employeeId: z.string().cuid() }).parse(request.params);

      const employee = await prisma.employee.findUnique({
        where: { id: params.employeeId },
        include: { biometric: true }
      });
      if (!employee) {
        return reply.code(404).send({ message: "Funcionário não encontrado" });
      }

      const deliveries = await prisma.epiDelivery.findMany({
        where: { employeeId: params.employeeId },
        include: {
          epi: true,
          responsibleUser: {
            include: { employee: true }
          }
        },
        orderBy: { date: "desc" }
      });

      return { employee, deliveries };
    }
  );
}
