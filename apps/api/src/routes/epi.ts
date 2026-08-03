import type { FastifyInstance } from "fastify";
import { ConfirmationMethod, EpiMovementType, HrPermission, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { snapshotEpiCost } from "../services/epiCosts.js";
import { assertCompanyAccess, assertUnitAccess, publicUserSelect, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";

function parseDeliveryDate(value?: string | Date) {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  const normalized = String(value).trim();
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = dateOnlyMatch[1];
    const month = dateOnlyMatch[2];
    const day = dateOnlyMatch[3];

    // Mantem a data escolhida e aplica a hora atual de Sao Paulo (GMT-3).
    const nowSp = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
      .format(new Date())
      .replace(/[^\d:]/g, "");
    const [hour = "00", minute = "00", second = "00"] = nowSp.split(":");

    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  }

  return new Date(normalized);
}

export async function epiRoutes(app: FastifyInstance) {
  app.get("/epis", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] }, async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        companyId: z.string().optional(),
        unitId: z.string().optional(),
        isActive: z
          .string()
          .optional()
          .transform((value) => {
            if (value === undefined) return undefined;
            return value === "true";
          })
      })
      .parse(request.query);
    const scope = await resolveHrDataScope(request);
    if (query.companyId) assertCompanyAccess(scope, query.companyId);

    return prisma.epi.findMany({
      where: {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
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

  app.get("/epis/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);

    const epi = await prisma.epi.findFirst({
      where: { id: params.id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
      include: {
        movements: {
          include: { employee: true, responsibleUser: { select: publicUserSelect } },
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

  app.post("/epis", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_MANAGE)] }, async (request, reply) => {
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
        ,companyId: z.string().optional()
        ,unitId: z.string().optional().nullable()
      })
      .parse(request.body);
    const scope = await resolveHrDataScope(request);
    const companyId = body.companyId ?? (scope.companyIds.length === 1 ? scope.companyIds[0] : undefined);
    if (!companyId) return reply.code(400).send({ message: "Informe a empresa do EPI" });
    assertCompanyAccess(scope, companyId);
    assertUnitAccess(scope, body.unitId);
    await assertOrganizationReferences(companyId, body);

    const epi = await prisma.$transaction(async (tx) => {
      const created = await tx.epi.create({ data: { ...body, companyId, isActive: body.isActive ?? true } });
      await writeAudit(tx, request, { companyId, unitId: body.unitId, action: "EPI_CREATE", entityType: "Epi", entityId: created.id, newValue: created });
      return created;
    });

    return reply.code(201).send(epi);
  });

  app.patch("/epis/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_MANAGE)] }, async (request, reply) => {
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
        ,companyId: z.string().optional()
        ,unitId: z.string().optional().nullable()
      })
      .parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.epi.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "EPI nao encontrado" });
    if (body.companyId) assertCompanyAccess(scope, body.companyId);
    assertUnitAccess(scope, body.unitId);
    const nextCompanyId = body.companyId ?? existing.companyId;
    if (nextCompanyId) await assertOrganizationReferences(nextCompanyId, body);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.epi.update({ where: { id: params.id }, data: body });
      await writeAudit(tx, request, { companyId: updated.companyId, unitId: updated.unitId, action: "EPI_UPDATE", entityType: "Epi", entityId: updated.id, previousValue: existing, newValue: updated });
      return updated;
    });
  });

  app.delete("/epis/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.epi.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "EPI nao encontrado" });

    try {
      await prisma.$transaction(async (tx) => {
        await tx.epi.delete({ where: { id: params.id } });
        await writeAudit(tx, request, { companyId: existing.companyId, unitId: existing.unitId, action: "EPI_DELETE", entityType: "Epi", entityId: existing.id, previousValue: existing });
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

  app.get("/epi-deliveries", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] }, async (request) => {
    const query = z
      .object({
        employeeId: z.string().cuid().optional(),
        epiId: z.string().cuid().optional(),
        movementType: z.nativeEnum(EpiMovementType).optional()
        ,companyId: z.string().optional()
        ,unitId: z.string().optional()
      })
      .parse(request.query);
    const scope = await resolveHrDataScope(request);
    if (query.companyId) assertCompanyAccess(scope, query.companyId);

    return prisma.epiDelivery.findMany({
      where: {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        employeeId: query.employeeId,
        epiId: query.epiId,
        movementType: query.movementType
      },
      include: {
        employee: true,
        epi: true,
        responsibleUser: {
          select: { ...publicUserSelect, employee: { select: { id: true, name: true } } }
        },
        attachments: true
      },
      orderBy: { date: "desc" }
    });
  });

  app.post("/epi-deliveries", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_MANAGE)] }, async (request, reply) => {
    const body = z
      .object({
        employeeId: z.string().cuid(),
        epiId: z.string().cuid(),
        movementType: z.nativeEnum(EpiMovementType).default(EpiMovementType.ENTREGA),
        quantity: z.number().int().positive(),
        date: z.union([z.string(), z.date()]).optional(),
        notes: z.string().optional().nullable(),
        confirmationMethod: z.nativeEnum(ConfirmationMethod),
        confirmationBiometricId: z.string().optional().nullable(),
        employeeSignatureName: z.string().min(2),
        employeeConfirmedAt: z.coerce.date().optional().nullable(),
        attachmentIds: z.array(z.string().cuid()).optional()
        ,movementReason: z.string().max(500).optional().nullable()
      })
      .parse(request.body);
    const scope = await resolveHrDataScope(request);

    if (body.confirmationMethod === ConfirmationMethod.BIOMETRIA && !body.confirmationBiometricId) {
      return reply
        .code(400)
        .send({ message: "confirmationBiometricId é obrigatório quando confirmação for por biometria" });
    }

    const delivery = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: body.employeeId, companyId: { in: scope.companyIds } } });
      const epi = await tx.epi.findFirst({ where: { id: body.epiId, companyId: { in: scope.companyIds } } });
      if (!employee || !epi || !employee.companyId || employee.companyId !== epi.companyId) throw new Error("Funcionario e EPI devem pertencer a mesma empresa autorizada");
      assertUnitAccess(scope, employee.unitId);

      if (body.movementType === EpiMovementType.DEVOLUCAO) {
        const movements = await tx.epiDelivery.groupBy({ by: ["movementType"], where: { employeeId: employee.id, epiId: epi.id }, _sum: { quantity: true } });
        const issued = movements.filter((item) => item.movementType !== EpiMovementType.DEVOLUCAO).reduce((sum, item) => sum + (item._sum.quantity ?? 0), 0);
        const returned = movements.find((item) => item.movementType === EpiMovementType.DEVOLUCAO)?._sum.quantity ?? 0;
        if (issued - returned < body.quantity) throw new Error("A devolucao excede a quantidade entregue ao funcionario");
        await tx.epi.update({ where: { id: epi.id }, data: { stock: { increment: body.quantity } } });
      } else {
        const stockUpdate = await tx.epi.updateMany({ where: { id: epi.id, stock: { gte: body.quantity } }, data: { stock: { decrement: body.quantity } } });
        if (stockUpdate.count !== 1) throw new Error("Estoque insuficiente para esta movimentacao");
      }

      const created = await tx.epiDelivery.create({
        data: {
          employeeId: body.employeeId,
          epiId: body.epiId,
          movementType: body.movementType,
          quantity: body.quantity,
          date: parseDeliveryDate(body.date),
          responsibleUserId: request.user.id,
          notes: body.notes,
          confirmationMethod: body.confirmationMethod,
          confirmationBiometricId: body.confirmationBiometricId,
          employeeSignatureName: body.employeeSignatureName,
          employeeConfirmedAt: body.employeeConfirmedAt ?? new Date(),
          companyId: employee.companyId,
          unitId: employee.unitId,
          ...snapshotEpiCost(epi.purchasePrice),
          departmentSnapshot: employee.department,
          positionSnapshot: employee.position,
          costCenterSnapshot: null,
          movementReason: body.movementReason,
          attachments: body.attachmentIds
            ? { connect: body.attachmentIds.map((id) => ({ id })) }
            : undefined
        },
        include: {
          employee: true,
          epi: true,
          responsibleUser: {
            select: { ...publicUserSelect, employee: { select: { id: true, name: true } } }
          },
          attachments: true
        }
      });
      await writeAudit(tx, request, { companyId: employee.companyId, unitId: employee.unitId, action: `EPI_${body.movementType}`, entityType: "EpiDelivery", entityId: created.id, newValue: created });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return reply.code(201).send(delivery);
  });

  app.get(
    "/reports/epi-by-employee/:employeeId",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.EPI_VIEW)] },
    async (request, reply) => {
      const params = z.object({ employeeId: z.string().cuid() }).parse(request.params);

      const scope = await resolveHrDataScope(request);
      const employee = await prisma.employee.findFirst({
        where: { id: params.employeeId, companyId: { in: scope.companyIds } },
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
            select: { ...publicUserSelect, employee: { select: { id: true, name: true } } }
          }
        },
        orderBy: { date: "desc" }
      });

      return { employee, deliveries };
    }
  );
}
