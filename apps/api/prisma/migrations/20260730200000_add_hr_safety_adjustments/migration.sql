-- Ajustes aditivos de seguranca para setores, indicadores e ciclo de vida do funcionario.
-- Nao executar em producao sem homologacao, backup e autorizacao expressa.

ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'DEPARTMENT_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'DEPARTMENT_CREATE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'DEPARTMENT_EDIT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'DEPARTMENT_DEACTIVATE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'DEPARTMENT_DELETE';

CREATE TYPE "EmployeeInactivationReason" AS ENUM ('TERMINATED_BY_COMPANY', 'VOLUNTARY_RESIGNATION');
CREATE TYPE "EmployeeLifecycleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "Department"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletionReason" TEXT;

ALTER TABLE "Employee"
  ADD COLUMN "inactiveEffectiveDate" DATE,
  ADD COLUMN "inactiveReason" "EmployeeInactivationReason",
  ADD COLUMN "inactiveNotes" TEXT,
  ADD COLUMN "inactivatedById" TEXT;

ALTER TABLE "EmployeeOccurrence"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "departmentNameSnapshot" TEXT;

ALTER TABLE "ChecklistExecution"
  ADD COLUMN "departmentNameSnapshot" TEXT;

CREATE TABLE "EmployeeStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "employeeId" TEXT NOT NULL,
  "previousStatus" "EmployeeLifecycleStatus" NOT NULL,
  "newStatus" "EmployeeLifecycleStatus" NOT NULL,
  "reason" "EmployeeInactivationReason",
  "effectiveDate" DATE NOT NULL,
  "notes" TEXT,
  "departmentId" TEXT,
  "departmentNameSnapshot" TEXT,
  "futureSchedulesAffected" INTEGER NOT NULL DEFAULT 0,
  "assignmentsAffected" INTEGER NOT NULL DEFAULT 0,
  "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Department_companyId_deletedAt_isActive_idx" ON "Department"("companyId", "deletedAt", "isActive");
CREATE INDEX "Employee_companyId_inactiveEffectiveDate_idx" ON "Employee"("companyId", "inactiveEffectiveDate");
CREATE INDEX "EmployeeOccurrence_companyId_departmentId_startDate_status_idx" ON "EmployeeOccurrence"("companyId", "departmentId", "startDate", "status");
CREATE INDEX "EmployeeStatusHistory_employeeId_effectiveDate_createdAt_idx" ON "EmployeeStatusHistory"("employeeId", "effectiveDate", "createdAt");
CREATE INDEX "EmployeeStatusHistory_companyId_createdAt_idx" ON "EmployeeStatusHistory"("companyId", "createdAt");

ALTER TABLE "Department" ADD CONSTRAINT "Department_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_inactivatedById_fkey" FOREIGN KEY ("inactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatusHistory" ADD CONSTRAINT "EmployeeStatusHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatusHistory" ADD CONSTRAINT "EmployeeStatusHistory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatusHistory" ADD CONSTRAINT "EmployeeStatusHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatusHistory" ADD CONSTRAINT "EmployeeStatusHistory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatusHistory" ADD CONSTRAINT "EmployeeStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
