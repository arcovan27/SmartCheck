import type { FastifyInstance } from "fastify";
import { BiometricProvider, BiometricStatus, HrPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAnyHrPermission, requireHrPermission, resolveHrDataScope } from "../services/hrAccess.js";

export async function biometricRoutes(app: FastifyInstance) {
  app.get("/biometric/templates", { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.EPI_MANAGE, HrPermission.EMPLOYEE_MANAGE)] }, async (request) => {
    const scope = await resolveHrDataScope(request);
    return prisma.employeeBiometric.findMany({
      where: {
        employee: { companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
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

  app.post("/biometric/enroll/start", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const body = z
      .object({
        employeeId: z.string().cuid(),
        provider: z.nativeEnum(BiometricProvider).default(BiometricProvider.UAREU_4500)
      })
      .parse(request.body);

    const scope = await resolveHrDataScope(request);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId: { in: scope.companyIds } } });
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

  app.post("/biometric/enroll/finish", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
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
    const scope = await resolveHrDataScope(request);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId: { in: scope.companyIds } }, select: { id: true } });
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });

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

  app.post("/biometric/identify", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_MANAGE)] }, async (request, reply) => {
    const body = z
      .object({
        biometricExternalId: z.string().optional(),
        biometricTemplateId: z.string().optional()
      })
      .refine((value) => Boolean(value.biometricExternalId || value.biometricTemplateId), {
        message: "Informe biometricExternalId ou biometricTemplateId"
      })
      .parse(request.body);
    const scope = await resolveHrDataScope(request);

    const biometric = await prisma.employeeBiometric.findFirst({
      where: {
        OR: [
          body.biometricExternalId ? { biometricExternalId: body.biometricExternalId } : undefined,
          body.biometricTemplateId ? { biometricTemplateId: body.biometricTemplateId } : undefined
        ].filter(Boolean) as any
      },
      include: { employee: true }
    });

    if (!biometric || !biometric.employee.companyId || !scope.companyIds.includes(biometric.employee.companyId) || (!scope.allUnitsInCompanies && biometric.employee.unitId && !scope.unitIds.includes(biometric.employee.unitId))) {
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

  app.get("/employees/:id/biometric", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_VIEW)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const scope = await resolveHrDataScope(request);
    const biometric = await prisma.employeeBiometric.findFirst({
      where: { employeeId: params.id, employee: { companyId: { in: scope.companyIds } } }
    });

    if (!biometric) {
      return reply.send({ status: BiometricStatus.SEM_BIOMETRIA });
    }

    return biometric;
  });

  app.delete("/employees/:id/biometric", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);

    const scope = await resolveHrDataScope(request);
    const existing = await prisma.employeeBiometric.findFirst({ where: { employeeId: params.id, employee: { companyId: { in: scope.companyIds } } } });

    if (!existing) {
      return reply.code(404).send({ message: "Nenhuma biometria vinculada para este funcionário" });
    }

    await prisma.employeeBiometric.delete({ where: { employeeId: params.id } });

    return { message: "Biometria removida com sucesso" };
  });
}
