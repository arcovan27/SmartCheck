import type { FastifyInstance } from "fastify";
import { HrPermission, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";

export async function hrPermissionRoutes(app: FastifyInstance) {
  app.get("/hr/permissions", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) return reply.code(403).send({ message: "Somente administradores podem gerenciar permissoes" });
    const grants = await prisma.rolePermission.findMany({ orderBy: [{ role: "asc" }, { permission: "asc" }] });
    return { roles: Object.values(UserRole), permissions: Object.values(HrPermission), grants };
  });

  app.put("/hr/permissions/:role", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) return reply.code(403).send({ message: "Somente administradores podem gerenciar permissoes" });
    const params = z.object({ role: z.nativeEnum(UserRole) }).parse(request.params);
    const body = z.object({ permissions: z.array(z.nativeEnum(HrPermission)).max(Object.values(HrPermission).length) }).parse(request.body);
    const uniquePermissions = [...new Set(body.permissions)];
    if (params.role === UserRole.ADMIN && uniquePermissions.length !== Object.values(HrPermission).length) {
      return reply.code(400).send({ message: "O perfil administrador deve manter todas as permissoes" });
    }
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.rolePermission.findMany({ where: { role: params.role }, select: { permission: true } });
      await tx.rolePermission.deleteMany({ where: { role: params.role } });
      if (uniquePermissions.length) await tx.rolePermission.createMany({ data: uniquePermissions.map((permission) => ({ role: params.role, permission })) });
      await writeAudit(tx, request, { action: "ROLE_PERMISSIONS_UPDATE", entityType: "UserRole", entityId: params.role, previousValue: previous, newValue: uniquePermissions });
      return tx.rolePermission.findMany({ where: { role: params.role }, orderBy: { permission: "asc" } });
    });
    return { role: params.role, grants: result };
  });

  app.put("/hr/user-scope/:userId", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) return reply.code(403).send({ message: "Somente administradores podem gerenciar escopos" });
    const params = z.object({ userId: z.string().cuid() }).parse(request.params);
    const body = z.object({ companyIds: z.array(z.string()).max(100), unitIds: z.array(z.string()).max(500) }).parse(request.body);
    const [companies, units, user] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: body.companyIds } }, select: { id: true } }),
      prisma.unit.findMany({ where: { id: { in: body.unitIds } }, select: { id: true, companyId: true } }),
      prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } })
    ]);
    if (!user) return reply.code(404).send({ message: "Usuario nao encontrado" });
    if (companies.length !== new Set(body.companyIds).size || units.length !== new Set(body.unitIds).size) return reply.code(400).send({ message: "Empresa ou unidade invalida" });
    const companyIds = new Set(body.companyIds);
    for (const unit of units) if (!companyIds.has(unit.companyId)) return reply.code(400).send({ message: "Toda unidade deve pertencer a uma empresa selecionada" });
    await prisma.$transaction(async (tx) => {
      const previous = await Promise.all([tx.userCompanyAccess.findMany({ where: { userId: user.id } }), tx.userUnitAccess.findMany({ where: { userId: user.id } })]);
      await tx.userUnitAccess.deleteMany({ where: { userId: user.id } });
      await tx.userCompanyAccess.deleteMany({ where: { userId: user.id } });
      if (companyIds.size) await tx.userCompanyAccess.createMany({ data: [...companyIds].map((companyId) => ({ userId: user.id, companyId })) });
      if (units.length) await tx.userUnitAccess.createMany({ data: units.map((unit) => ({ userId: user.id, unitId: unit.id })) });
      await writeAudit(tx, request, { action: "USER_HR_SCOPE_UPDATE", entityType: "User", entityId: user.id, previousValue: previous, newValue: body });
    });
    return { userId: user.id, companyIds: [...companyIds], unitIds: units.map((unit) => unit.id) };
  });
}
