import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { BiometricStatus, EmployeeInactivationReason, EmployeeLifecycleStatus, EmployeeOccurrenceType, HrPermission, OccurrenceStatus, Prisma, ScheduleAssignmentStatus, UserRole, WorkScheduleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, hasHrPermission, publicUserSelect, requireAnyHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { assertOrganizationReferences } from "../services/hrOrganization.js";
import { env } from "../env.js";
import { inclusiveDateRange } from "../services/hrSafety.js";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data valida");
const inactivationSchema = z.object({
  reason: z.nativeEnum(EmployeeInactivationReason),
  effectiveDate: dateKeySchema,
  notes: z.string().trim().max(1000).optional().nullable(),
  confirmFutureSchedules: z.boolean().optional().default(false)
});
const reactivationSchema = z.object({
  effectiveDate: dateKeySchema,
  notes: z.string().trim().max(1000).optional().nullable()
});

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: env.APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function futureScheduleWhere(employeeId: string, effectiveDate: string): Prisma.WorkScheduleWhereInput {
  const range = inclusiveDateRange(effectiveDate, effectiveDate, env.APP_TIMEZONE);
  return {
    employeeId,
    status: WorkScheduleStatus.ATIVA,
    OR: [
      { scheduleDate: { gt: dateOnly(effectiveDate) } },
      { scheduleDate: null, startAt: { gte: range.endExclusive } }
    ]
  };
}

async function employeeInactivationImpact(db: typeof prisma | Prisma.TransactionClient, employeeId: string, effectiveDate: string) {
  const effective = dateOnly(effectiveDate);
  const [futureSchedules, futureAssignments, spanningAssignments] = await Promise.all([
    db.workSchedule.count({ where: futureScheduleWhere(employeeId, effectiveDate) }),
    db.scheduleAssignment.count({ where: { employeeId, status: ScheduleAssignmentStatus.ACTIVE, validFrom: { gt: effective } } }),
    db.scheduleAssignment.count({
      where: {
        employeeId,
        status: ScheduleAssignmentStatus.ACTIVE,
        validFrom: { lte: effective },
        OR: [{ validUntil: null }, { validUntil: { gt: effective } }]
      }
    })
  ]);
  return { futureSchedules, futureAssignments, spanningAssignments, totalAssignments: futureAssignments + spanningAssignments };
}

export async function employeeRoutes(app: FastifyInstance) {
  app.get("/employees", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_VIEW)] }, async (request) => {
    const query = z
      .object({
        name: z.string().optional(),
        registration: z.string().optional(),
        department: z.string().optional(),
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

    return prisma.employee.findMany({
      where: {
        companyId: { in: query.companyId ? [query.companyId] : scope.companyIds },
        unitId: unitScopeFilter(scope, query.unitId),
        isActive: query.isActive,
        name: query.name ? { contains: query.name, mode: "insensitive" } : undefined,
        registration: query.registration
          ? { contains: query.registration, mode: "insensitive" }
          : undefined,
        department: query.department ? { contains: query.department, mode: "insensitive" } : undefined
      },
      include: {
        user: { select: publicUserSelect },
        biometric: true,
        company: { select: { id: true, legalName: true, tradeName: true } },
        unitRef: { select: { id: true, name: true } },
        departmentRef: { select: { id: true, name: true, deletedAt: true } }
      },
      orderBy: { name: "asc" }
    });
  });

  app.get("/employees/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_VIEW)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const [canViewOccurrences, canViewWarnings, canViewSuspensions, canViewWorkAccidents] = await Promise.all([
      Promise.all([hasHrPermission(request.user.role, HrPermission.OCCURRENCE_VIEW), hasHrPermission(request.user.role, HrPermission.OCCURRENCE_REVIEW)]).then((values) => values.some(Boolean)),
      hasHrPermission(request.user.role, HrPermission.WARNING_VIEW),
      hasHrPermission(request.user.role, HrPermission.SUSPENSION_VIEW),
      hasHrPermission(request.user.role, HrPermission.WORK_ACCIDENT_VIEW)
    ]);

    const employee = await prisma.employee.findFirst({
      where: { id: params.id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
      include: {
        user: { select: publicUserSelect },
        biometric: true,
        company: { select: { id: true, legalName: true, tradeName: true } },
        unitRef: { select: { id: true, name: true } },
        departmentRef: { select: { id: true, name: true, deletedAt: true } },
        statusHistory: {
          include: { changedBy: { select: publicUserSelect } },
          orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
          take: 50
        },
        epiMovements: {
          include: { epi: true, responsibleUser: { select: publicUserSelect } },
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
        occurrences: canViewOccurrences ? {
          where: {
            deletedAt: null,
            AND: [
              ...(!canViewWarnings ? [{ NOT: { OR: [{ frequencyType: { code: "ADVERT" } }, { frequencyTypeId: null, type: EmployeeOccurrenceType.ADVERTENCIA }] } }] : []),
              ...(!canViewSuspensions ? [{ NOT: { frequencyType: { code: "SUSP" } } }] : []),
              ...(!canViewWorkAccidents ? [{ NOT: { frequencyType: { code: "ACID_TRAB" } } }] : [])
            ]
          },
          select: {
            id: true, type: true, date: true, startDate: true, endDate: true, description: true,
            daysAway: true, hoursAway: true, isJustified: true, notes: true, status: true,
            attachmentPath: true, attachmentMimeType: true, attachmentFilename: true,
            frequencyType: { select: { code: true, shortCode: true, name: true, category: true, color: true } },
            hasAccidentLeave: true, accidentLeaveStartDate: true, accidentLeaveEndDate: true,
            attachments: { where: { deletedAt: null }, select: { id: true, filename: true, mimeType: true, createdAt: true } }
          },
          orderBy: { date: "desc" },
          take: 100
        } : false
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

  app.post("/employees", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
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
        companyId: z.string().optional(),
        unitId: z.string().optional().nullable(),
        departmentId: z.string().optional().nullable(),
        positionId: z.string().optional().nullable(),
        costCenterId: z.string().optional().nullable(),
        teamId: z.string().optional().nullable(),
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
    if (body.isActive === false) return reply.code(400).send({ message: "Cadastre o funcionario ativo e use o fluxo de inativacao para registrar motivo e data efetiva" });
    const scope = await resolveHrDataScope(request);
    if (request.user.role !== UserRole.ADMIN && (body.userId || body.userAccess?.enabled)) {
      return reply.code(403).send({ message: "Somente administradores podem conceder acesso ao sistema" });
    }
    const companyId = body.companyId ?? (scope.companyIds.length === 1 ? scope.companyIds[0] : undefined);
    if (!companyId) return reply.code(400).send({ message: "Informe a empresa do funcionario" });
    assertCompanyAccess(scope, companyId);
    assertUnitAccess(scope, body.unitId);
    await assertOrganizationReferences(companyId, body);

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
          companyId,
          unitId: body.unitId,
          departmentId: body.departmentId,
          positionId: body.positionId,
          costCenterId: body.costCenterId,
          teamId: body.teamId,
          user: body.userId ? { connect: { id: body.userId } } : undefined
        }
      });

      if (body.userAccess?.enabled) {
        if (!body.userAccess.email || !body.userAccess.password || !body.userAccess.role) {
          throw new Error("Para liberar acesso ao sistema, informe e-mail, senha e perfil.");
        }
        const passwordHash = await bcrypt.hash(body.userAccess.password, 10);
        const createdUser = await tx.user.create({
          data: {
            email: body.userAccess.email,
            passwordHash,
            role: body.userAccess.role,
            isActive: body.userAccess.isActive ?? true,
            employeeId: createdEmployee.id
          }
        });
        await tx.userCompanyAccess.create({ data: { userId: createdUser.id, companyId } });
        if (body.unitId) await tx.userUnitAccess.create({ data: { userId: createdUser.id, unitId: body.unitId } });
      }
      const result = await tx.employee.findUniqueOrThrow({
        where: { id: createdEmployee.id },
        include: { user: { select: publicUserSelect }, biometric: true }
      });
      await writeAudit(tx, request, { companyId, unitId: body.unitId, action: "EMPLOYEE_CREATE", entityType: "Employee", entityId: result.id, newValue: result });
      return result;
    });

    return reply.code(201).send(employee);
  });

  app.patch("/employees/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
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
        companyId: z.string().optional(),
        unitId: z.string().optional().nullable(),
        departmentId: z.string().optional().nullable(),
        positionId: z.string().optional().nullable(),
        costCenterId: z.string().optional().nullable(),
        teamId: z.string().optional().nullable(),
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
    const scope = await resolveHrDataScope(request);
    if (request.user.role !== UserRole.ADMIN && (body.userId !== undefined || body.userAccess !== undefined)) {
      return reply.code(403).send({ message: "Somente administradores podem alterar acesso ao sistema" });
    }
    if (body.companyId) assertCompanyAccess(scope, body.companyId);
    assertUnitAccess(scope, body.unitId);

    return prisma.$transaction(async (tx) => {
      const existingEmployee = await tx.employee.findFirst({
        where: { id: params.id, companyId: { in: scope.companyIds } },
        include: { user: { select: publicUserSelect } }
      });
      if (!existingEmployee) return reply.code(404).send({ message: "Funcionario nao encontrado" });
      if (body.isActive !== undefined && body.isActive !== existingEmployee.isActive) {
        return reply.code(409).send({ message: "Use o fluxo de inativacao ou reativacao para alterar o status do funcionario" });
      }
      const nextCompanyId = body.companyId ?? existingEmployee.companyId;
      if (nextCompanyId) await assertOrganizationReferences(nextCompanyId, body);

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
          companyId: body.companyId,
          unitId: body.unitId,
          departmentId: body.departmentId,
          positionId: body.positionId,
          costCenterId: body.costCenterId,
          teamId: body.teamId,
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

      const result = await tx.employee.findUniqueOrThrow({
        where: { id: params.id },
        include: { user: { select: publicUserSelect }, biometric: true }
      });
      await writeAudit(tx, request, { companyId: result.companyId, unitId: result.unitId, action: "EMPLOYEE_UPDATE", entityType: "Employee", entityId: result.id, previousValue: existingEmployee, newValue: result });
      return result;
    });
  });

  app.patch("/employees/:id/status", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ isActive: z.boolean() }).parse(request.body);

    const scope = await resolveHrDataScope(request);
    const existing = await prisma.employee.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds } } });
    if (!existing) return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (existing.isActive === body.isActive) return existing;
    return reply.code(409).send({
      message: body.isActive
        ? "Use o fluxo de reativacao para preservar o historico"
        : "Informe motivo e data efetiva no fluxo de inativacao"
    });
  });

  app.get("/employees/:id/inactivation-impact", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const { effectiveDate } = z.object({ effectiveDate: dateKeySchema }).parse(request.query);
    if (effectiveDate > todayKey()) return reply.code(400).send({ message: "A data efetiva nao pode estar no futuro" });
    const scope = await resolveHrDataScope(request);
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
      select: {
        id: true, name: true, registration: true, companyId: true, unitId: true, isActive: true,
        company: { select: { legalName: true, tradeName: true } }, unitRef: { select: { name: true } }, departmentRef: { select: { id: true, name: true } }
      }
    });
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (!employee.companyId) return reply.code(409).send({ message: "Funcionario sem empresa vinculada. Regularize o cadastro antes de inativar." });
    return { employee, impact: await employeeInactivationImpact(prisma, id, effectiveDate) };
  });

  app.post("/employees/:id/inactivate", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = inactivationSchema.parse(request.body);
    if (body.effectiveDate > todayKey()) return reply.code(400).send({ message: "A data efetiva nao pode estar no futuro" });
    const scope = await resolveHrDataScope(request);
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
      include: { user: { select: { id: true } }, departmentRef: { select: { id: true, name: true } } }
    });
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (!employee.companyId) return reply.code(409).send({ message: "Funcionario sem empresa vinculada. Regularize o cadastro antes de inativar." });
    if (!employee.isActive) return reply.code(409).send({ message: "O funcionario ja esta inativo" });
    const companyId = employee.companyId;
    const preview = await employeeInactivationImpact(prisma, id, body.effectiveDate);
    if ((preview.futureSchedules > 0 || preview.totalAssignments > 0) && !body.confirmFutureSchedules) {
      return reply.code(409).send({
        message: "Existem escalas futuras. Confirme o encerramento antes de inativar.",
        requiresConfirmation: true,
        impact: preview
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.employee.findFirst({
        where: { id, companyId },
        include: { user: { select: { id: true } }, departmentRef: { select: { id: true, name: true } } }
      });
      if (!current) return { kind: "missing" as const };
      if (!current.isActive) return { kind: "inactive" as const };
      const impact = await employeeInactivationImpact(tx, id, body.effectiveDate);
      if ((impact.futureSchedules > 0 || impact.totalAssignments > 0) && !body.confirmFutureSchedules) {
        return { kind: "confirmation" as const, impact };
      }
      const effective = dateOnly(body.effectiveDate);
      const cancelledSchedules = await tx.workSchedule.updateMany({
        where: futureScheduleWhere(id, body.effectiveDate),
        data: { status: WorkScheduleStatus.CANCELADA, updatedById: request.user.id }
      });
      const cancelledAssignments = await tx.scheduleAssignment.updateMany({
        where: { employeeId: id, status: ScheduleAssignmentStatus.ACTIVE, validFrom: { gt: effective } },
        data: { status: ScheduleAssignmentStatus.CANCELLED, updatedById: request.user.id }
      });
      const closedAssignments = await tx.scheduleAssignment.updateMany({
        where: {
          employeeId: id,
          status: ScheduleAssignmentStatus.ACTIVE,
          validFrom: { lte: effective },
          OR: [{ validUntil: null }, { validUntil: { gt: effective } }]
        },
        data: { validUntil: effective, updatedById: request.user.id }
      });
      const updated = await tx.employee.update({
        where: { id },
        data: {
          isActive: false,
          dismissalDate: effective,
          inactiveEffectiveDate: effective,
          inactiveReason: body.reason,
          inactiveNotes: body.notes ?? null,
          inactivatedById: request.user.id
        }
      });
      if (current.user) await tx.user.update({ where: { id: current.user.id }, data: { isActive: false } });
      const assignmentsAffected = cancelledAssignments.count + closedAssignments.count;
      await tx.employeeStatusHistory.create({
        data: {
          companyId,
          unitId: current.unitId,
          employeeId: current.id,
          previousStatus: EmployeeLifecycleStatus.ACTIVE,
          newStatus: EmployeeLifecycleStatus.INACTIVE,
          reason: body.reason,
          effectiveDate: effective,
          notes: body.notes ?? null,
          departmentId: current.departmentId,
          departmentNameSnapshot: current.departmentRef?.name ?? current.department,
          futureSchedulesAffected: cancelledSchedules.count,
          assignmentsAffected,
          changedById: request.user.id
        }
      });
      await writeAudit(tx, request, {
        companyId: current.companyId,
        unitId: current.unitId,
        action: "EMPLOYEE_INACTIVATE",
        entityType: "Employee",
        entityId: current.id,
        previousValue: { isActive: current.isActive, dismissalDate: current.dismissalDate },
        newValue: { isActive: false, effectiveDate: body.effectiveDate, reason: body.reason, notes: body.notes ?? null },
        metadata: { futureSchedulesAffected: cancelledSchedules.count, assignmentsAffected }
      });
      return { kind: "updated" as const, employee: updated, impact: { futureSchedules: cancelledSchedules.count, assignments: assignmentsAffected } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "missing") return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (result.kind === "inactive") return reply.code(409).send({ message: "O funcionario ja esta inativo" });
    if (result.kind === "confirmation") return reply.code(409).send({ message: "Os vinculos futuros foram alterados. Revise e confirme novamente.", requiresConfirmation: true, impact: result.impact });
    return { message: "Funcionario inativado. Os historicos foram preservados.", ...result };
  });

  app.post("/employees/:id/reactivate", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = reactivationSchema.parse(request.body);
    if (body.effectiveDate > todayKey()) return reply.code(400).send({ message: "A data efetiva nao pode estar no futuro" });
    const scope = await resolveHrDataScope(request);
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: { in: scope.companyIds }, unitId: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds } },
      include: { departmentRef: { select: { id: true, name: true } } }
    });
    if (!employee) return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (!employee.companyId) return reply.code(409).send({ message: "Funcionario sem empresa vinculada. Regularize o cadastro antes de reativar." });
    if (employee.isActive) return reply.code(409).send({ message: "O funcionario ja esta ativo" });
    const companyId = employee.companyId;
    const effective = dateOnly(body.effectiveDate);
    const transactionResult = await prisma.$transaction(async (tx) => {
      const current = await tx.employee.findFirst({
        where: { id, companyId },
        include: { departmentRef: { select: { id: true, name: true } } }
      });
      if (!current) return { kind: "missing" as const };
      if (current.isActive) return { kind: "active" as const };
      const result = await tx.employee.update({
        where: { id },
        data: {
          isActive: true,
          dismissalDate: null,
          inactiveEffectiveDate: null,
          inactiveReason: null,
          inactiveNotes: null,
          inactivatedById: null
        }
      });
      await tx.employeeStatusHistory.create({
        data: {
          companyId,
          unitId: current.unitId,
          employeeId: current.id,
          previousStatus: EmployeeLifecycleStatus.INACTIVE,
          newStatus: EmployeeLifecycleStatus.ACTIVE,
          effectiveDate: effective,
          notes: body.notes ?? null,
          departmentId: current.departmentId,
          departmentNameSnapshot: current.departmentRef?.name ?? current.department,
          changedById: request.user.id
        }
      });
      await writeAudit(tx, request, {
        companyId: current.companyId,
        unitId: current.unitId,
        action: "EMPLOYEE_REACTIVATE",
        entityType: "Employee",
        entityId: current.id,
        previousValue: { isActive: false, inactiveReason: current.inactiveReason, inactiveEffectiveDate: current.inactiveEffectiveDate },
        newValue: { isActive: true, effectiveDate: body.effectiveDate },
        metadata: { schedulesRestored: 0 }
      });
      return { kind: "updated" as const, employee: result };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (transactionResult.kind === "missing") return reply.code(404).send({ message: "Funcionario nao encontrado" });
    if (transactionResult.kind === "active") return reply.code(409).send({ message: "O funcionario ja foi reativado por outra operacao" });
    return { message: "Funcionario reativado. Escalas canceladas nao foram restauradas.", employee: transactionResult.employee };
  });

  app.delete("/employees/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.EMPLOYEE_MANAGE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.code(405).send({
      message: "A exclusao fisica de funcionarios foi desabilitada. Use a inativacao para preservar os historicos.",
      employeeId: params.id
    });
  });

  app.post("/employees/:id/occurrences", { preHandler: [app.authenticate, requireHrPermission(HrPermission.OCCURRENCE_REGISTER)] }, async (request, reply) => {
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
    if (body.attachmentPath) {
      return reply.code(400).send({ message: "Documentos de ocorrencia devem ser enviados pelo fluxo protegido de atestados" });
    }
    if (body.type === EmployeeOccurrenceType.ADVERTENCIA) return reply.code(409).send({ message: "Registre advertencias pelo fluxo Recursos Humanos > Nova ocorrencia" });
    const scope = await resolveHrDataScope(request);

    const employee = await prisma.employee.findFirst({
      where: { id: params.id, companyId: { in: scope.companyIds } },
      select: { id: true, companyId: true, unitId: true, isActive: true, inactiveEffectiveDate: true, departmentId: true, department: true, departmentRef: { select: { name: true } } }
    });

    if (!employee) {
      return reply.code(404).send({ message: "Funcionario nao encontrado" });
    }
    if (!employee.isActive && employee.inactiveEffectiveDate && body.date > employee.inactiveEffectiveDate) {
      return reply.code(409).send({ message: "Nao e permitido registrar ocorrencia operacional apos a inativacao do funcionario" });
    }

    assertUnitAccess(scope, employee.unitId);
    const occurrence = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeOccurrence.create({
        data: {
          employeeId: params.id,
          companyId: employee.companyId,
          unitId: employee.unitId,
          departmentId: employee.departmentId,
          departmentNameSnapshot: employee.departmentRef?.name ?? employee.department,
          type: body.type,
          date: body.date,
          startDate: body.date,
          endDate: new Date(body.date.getTime() + (Math.max(body.daysAway ?? 1, 1) - 1) * 86_400_000),
          description: body.description,
          daysAway: body.daysAway ?? null,
          notes: body.notes ?? null,
          status: OccurrenceStatus.PENDENTE,
          registeredById: request.user.id
        }
      });
      await writeAudit(tx, request, { companyId: employee.companyId, unitId: employee.unitId, action: "OCCURRENCE_CREATE", entityType: "EmployeeOccurrence", entityId: created.id, newValue: created });
      return created;
    });

    return reply.code(201).send(occurrence);
  });

  app.delete(
    "/employees/:id/occurrences/:occurrenceId",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_CANCEL, HrPermission.OCCURRENCE_REVIEW)] },
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().cuid(),
          occurrenceId: z.string().cuid()
        })
        .parse(request.params);

      const scope = await resolveHrDataScope(request);
      const occurrence = await prisma.employeeOccurrence.findFirst({
        where: { id: params.occurrenceId, companyId: { in: scope.companyIds }, deletedAt: null },
        select: { id: true, employeeId: true, companyId: true, unitId: true, status: true }
      });

      if (!occurrence || occurrence.employeeId !== params.id) {
        return reply.code(404).send({ message: "Ocorrencia nao encontrada para este funcionario" });
      }

      assertUnitAccess(scope, occurrence.unitId);
      await prisma.$transaction(async (tx) => {
        await tx.employeeOccurrence.update({ where: { id: params.occurrenceId }, data: { status: OccurrenceStatus.CANCELADO, deletedAt: new Date(), reviewedById: request.user.id, reviewedAt: new Date() } });
        await tx.dailyAttendance.updateMany({ where: { occurrenceId: occurrence.id, deletedAt: null }, data: { status: OccurrenceStatus.CANCELADO, deletedAt: new Date(), updatedById: request.user.id } });
        await writeAudit(tx, request, { companyId: occurrence.companyId, unitId: occurrence.unitId, action: "OCCURRENCE_CANCEL", entityType: "EmployeeOccurrence", entityId: occurrence.id, previousValue: { status: occurrence.status }, newValue: { status: OccurrenceStatus.CANCELADO } });
      });
      return reply.send({ message: "Ocorrencia cancelada com sucesso" });
    }
  );
}


