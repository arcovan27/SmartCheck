import { prisma } from "../prisma.js";
import { operationalDepartmentWhere } from "./hrSafety.js";

export async function assertOrganizationReferences(companyId: string, input: {
  unitId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  costCenterId?: string | null;
  teamId?: string | null;
  shiftId?: string | null;
}) {
  const checks = await Promise.all([
    input.unitId ? prisma.unit.findFirst({ where: { id: input.unitId, companyId }, select: { id: true } }) : true,
    input.departmentId ? prisma.department.findFirst({ where: { id: input.departmentId, companyId, ...operationalDepartmentWhere }, select: { id: true } }) : true,
    input.positionId ? prisma.position.findFirst({ where: { id: input.positionId, companyId }, select: { id: true } }) : true,
    input.costCenterId ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId }, select: { id: true } }) : true,
    input.teamId ? prisma.team.findFirst({ where: { id: input.teamId, companyId }, select: { id: true } }) : true,
    input.shiftId ? prisma.workShift.findFirst({ where: { id: input.shiftId, companyId }, select: { id: true } }) : true
  ]);
  if (checks.some((value) => !value)) throw new Error("Referencia organizacional fora da empresa selecionada");
}
