import { HrPermission, UserRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";

const defaultRolePermissions: Record<UserRole, ReadonlySet<HrPermission>> = {
  ADMIN: new Set(Object.values(HrPermission)),
  SEGURANCA_DO_TRABALHO: new Set([
    HrPermission.HR_ACCESS,
    HrPermission.HR_DASHBOARD_VIEW,
    HrPermission.EPI_VIEW,
    HrPermission.EPI_COST_VIEW,
    HrPermission.EPI_MANAGE,
    HrPermission.EMPLOYEE_VIEW,
    HrPermission.EMPLOYEE_MANAGE,
    HrPermission.SCHEDULE_VIEW,
    HrPermission.SCHEDULE_MANAGE,
    HrPermission.OCCURRENCE_REGISTER,
    HrPermission.OCCURRENCE_REVIEW,
    HrPermission.OCCURRENCE_VIEW,
    HrPermission.OCCURRENCE_EDIT,
    HrPermission.OCCURRENCE_CANCEL,
    HrPermission.WARNING_VIEW,
    HrPermission.WARNING_REGISTER,
    HrPermission.SUSPENSION_VIEW,
    HrPermission.SUSPENSION_REGISTER,
    HrPermission.WORK_ACCIDENT_VIEW,
    HrPermission.WORK_ACCIDENT_REGISTER,
    HrPermission.DOCUMENT_VIEW,
    HrPermission.REPORT_EXPORT,
    HrPermission.CATALOG_MANAGE,
    HrPermission.DEPARTMENT_VIEW,
    HrPermission.DEPARTMENT_CREATE,
    HrPermission.DEPARTMENT_EDIT,
    HrPermission.DEPARTMENT_DEACTIVATE,
    HrPermission.DEPARTMENT_DELETE
  ]),
  ALMOXARIFADO: new Set([
    HrPermission.HR_ACCESS,
    HrPermission.EPI_VIEW,
    HrPermission.EPI_MANAGE,
    HrPermission.EMPLOYEE_VIEW,
    HrPermission.REPORT_EXPORT
  ]),
  MANUTENCAO: new Set([
    HrPermission.HR_ACCESS,
    HrPermission.EMPLOYEE_VIEW,
    HrPermission.SCHEDULE_VIEW
  ]),
  OPERADOR: new Set()
};

export type HrDataScope = {
  companyIds: string[];
  unitIds: string[];
  allUnitsInCompanies: boolean;
};

export const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true
} as const;

export function roleHasDefaultPermission(role: UserRole, permission: HrPermission): boolean {
  return defaultRolePermissions[role].has(permission);
}

export async function hasHrPermission(role: UserRole, permission: HrPermission): Promise<boolean> {
  if (role === UserRole.ADMIN) return true;

  try {
    const grant = await prisma.rolePermission.findUnique({
      where: { role_permission: { role, permission } },
      select: { role: true }
    });
    return Boolean(grant);
  } catch {
    // Mantem a aplicacao operante durante uma implantacao expand/contract.
    return roleHasDefaultPermission(role, permission);
  }
}

export async function listHrPermissions(role: UserRole): Promise<HrPermission[]> {
  if (role === UserRole.ADMIN) return [...Object.values(HrPermission)];
  try {
    const grants = await prisma.rolePermission.findMany({ where: { role }, select: { permission: true } });
    return grants.map((grant) => grant.permission);
  } catch {
    return [...defaultRolePermissions[role]];
  }
}

export function requireHrPermission(permission: HrPermission) {
  return async function checkPermission(request: FastifyRequest, reply: FastifyReply) {
    if (request.user.checklistOnly || !(await hasHrPermission(request.user.role, permission))) {
      return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
    }
  };
}

export function requireAnyHrPermission(...permissions: HrPermission[]) {
  return async function checkAnyPermission(request: FastifyRequest, reply: FastifyReply) {
    if (request.user.checklistOnly) return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
    for (const permission of permissions) {
      if (await hasHrPermission(request.user.role, permission)) return;
    }
    return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
  };
}

export async function resolveHrDataScope(request: FastifyRequest): Promise<HrDataScope> {
  const userId = request.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      employee: { select: { companyId: true, unitId: true } },
      companyAccess: { select: { companyId: true } },
      unitAccess: { select: { unitId: true, unit: { select: { companyId: true } } } }
    }
  });

  if (!user) return { companyIds: [], unitIds: [], allUnitsInCompanies: false };

  const companyIds = new Set(user.companyAccess.map((access) => access.companyId));
  const unitIds = new Set(user.unitAccess.map((access) => access.unitId));
  for (const access of user.unitAccess) companyIds.add(access.unit.companyId);
  if (user.employee?.companyId) companyIds.add(user.employee.companyId);
  if (user.employee?.unitId) unitIds.add(user.employee.unitId);

  if (user.role === UserRole.ADMIN && companyIds.size === 0) {
    const companies = await prisma.company.findMany({ select: { id: true } });
    for (const company of companies) companyIds.add(company.id);
    return { companyIds: [...companyIds], unitIds: [], allUnitsInCompanies: true };
  }

  if (companyIds.size === 0) {
    const onlyCompany = await prisma.company.findMany({ select: { id: true }, take: 2 });
    if (onlyCompany.length === 1) companyIds.add(onlyCompany[0].id);
  }

  return {
    companyIds: [...companyIds],
    unitIds: [...unitIds],
    allUnitsInCompanies: unitIds.size === 0
  };
}

export function assertCompanyAccess(scope: HrDataScope, companyId: string): void {
  if (!scope.companyIds.includes(companyId)) throw new Error("Empresa fora do escopo autorizado");
}

export function assertUnitAccess(scope: HrDataScope, unitId?: string | null): void {
  if (!unitId || scope.allUnitsInCompanies) return;
  if (!scope.unitIds.includes(unitId)) throw new Error("Unidade fora do escopo autorizado");
}

export function unitScopeFilter(scope: HrDataScope, requestedUnitId?: string) {
  if (requestedUnitId) {
    assertUnitAccess(scope, requestedUnitId);
    return requestedUnitId;
  }
  if (scope.allUnitsInCompanies) return undefined;
  return { in: scope.unitIds };
}
