import type { FastifyInstance } from "fastify";
import { BiometricProvider, BiometricStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";

export async function biometricRoutes(app: FastifyInstance) {
  app.get("/biometric/templates", { preHandler: [app.authenticate] }, async () => {
    return prisma.employeeBiometric.findMany({
      where: {
        provider: BiometricProvider.UAREU_4500,
        status: BiometricStatus.CADASTRADA,
        biometricTemplateId: { not: null }
      },
      select: {
        employeeId: true,
        biometricExternalId: true,
        biometricTemplateId: true,
        updatedAt: true
      }
    });
  });

  app.post("/biometric/enroll/start", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        employeeId: z.string().cuid(),
        provider: z.nativeEnum(BiometricProvider).default(BiometricProvider.UAREU_4500)
      })
      .parse(request.body);

    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
    if (!employee) {
      return reply.code(404).send({ message: "Funcionário não encontrado" });
    }

    const biometric = await prisma.employeeBiometric.upsert({
      where: { employeeId: body.employeeId },
      update: {
        provider: body.provider,
        status: BiometricStatus.PENDENTE
      },
      create: {
        employeeId: body.employeeId,
        provider: body.provider,
        status: BiometricStatus.PENDENTE
      }
    });

    return reply.code(201).send({
      message: "Coleta biométrica iniciada. Aguardando agente local finalizar.",
      biometric
    });
  });

  app.post("/biometric/enroll/finish", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        employeeId: z.string().cuid(),
        biometricTemplateId: z.string().optional().nullable(),
        biometricExternalId: z.string().optional().nullable(),
        provider: z.nativeEnum(BiometricProvider).default(BiometricProvider.UAREU_4500)
      })
      .refine((value) => Boolean(value.biometricTemplateId || value.biometricExternalId), {
        message: "Informe biometricTemplateId ou biometricExternalId"
      })
      .parse(request.body);

    const biometric = await prisma.employeeBiometric.upsert({
      where: { employeeId: body.employeeId },
      update: {
        biometricTemplateId: body.biometricTemplateId,
        biometricExternalId: body.biometricExternalId,
        provider: body.provider,
        status: BiometricStatus.CADASTRADA
      },
      create: {
        employeeId: body.employeeId,
        biometricTemplateId: body.biometricTemplateId,
        biometricExternalId: body.biometricExternalId,
        provider: body.provider,
        status: BiometricStatus.CADASTRADA
      }
    });

    return reply.code(201).send({ message: "Biometria cadastrada com sucesso", biometric });
  });

  app.post("/biometric/identify", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z
      .object({
        biometricExternalId: z.string().optional(),
        biometricTemplateId: z.string().optional()
      })
      .refine((value) => Boolean(value.biometricExternalId || value.biometricTemplateId), {
        message: "Informe biometricExternalId ou biometricTemplateId"
      })
      .parse(request.body);

    const biometric = await prisma.employeeBiometric.findFirst({
      where: {
        OR: [
          body.biometricExternalId ? { biometricExternalId: body.biometricExternalId } : undefined,
          body.biometricTemplateId ? { biometricTemplateId: body.biometricTemplateId } : undefined
        ].filter(Boolean) as any
      },
      include: { employee: true }
    });

    if (!biometric) {
      return reply.code(404).send({ message: "Biometria não identificada" });
    }

    if (biometric.status !== BiometricStatus.CADASTRADA) {
      return reply.code(409).send({ message: "Biometria encontrada, mas ainda não está cadastrada como ativa" });
    }

    return {
      employee: biometric.employee,
      biometric: {
        id: biometric.id,
        provider: biometric.provider,
        status: biometric.status,
        biometricExternalId: biometric.biometricExternalId
      }
    };
  });

  app.get("/employees/:id/biometric", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const biometric = await prisma.employeeBiometric.findUnique({
      where: { employeeId: params.id }
    });

    if (!biometric) {
      return reply.send({ status: BiometricStatus.SEM_BIOMETRIA });
    }

    return biometric;
  });

  app.delete("/employees/:id/biometric", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const existing = await prisma.employeeBiometric.findUnique({ where: { employeeId: params.id } });

    if (!existing) {
      return reply.code(404).send({ message: "Nenhuma biometria vinculada para este funcionário" });
    }

    await prisma.employeeBiometric.delete({ where: { employeeId: params.id } });

    return { message: "Biometria removida com sucesso" };
  });
}
