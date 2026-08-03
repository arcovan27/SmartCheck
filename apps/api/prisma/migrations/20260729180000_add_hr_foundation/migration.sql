-- SmartCheck Recursos Humanos - fundacao aditiva e retrocompativel.
-- IMPORTANTE: esta migracao nao deve ser executada em producao antes da reconciliacao da baseline.

CREATE TYPE "HrPermission" AS ENUM (
  'HR_ACCESS', 'HR_DASHBOARD_VIEW', 'EPI_VIEW', 'EPI_COST_VIEW', 'EPI_MANAGE',
  'EMPLOYEE_VIEW', 'EMPLOYEE_MANAGE', 'SCHEDULE_VIEW', 'SCHEDULE_MANAGE',
  'OCCURRENCE_REGISTER', 'OCCURRENCE_REVIEW', 'DOCUMENT_VIEW', 'REPORT_EXPORT',
  'CATALOG_MANAGE', 'AUDIT_VIEW'
);

CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'REJEITADO', 'CANCELADO');
CREATE TYPE "EpiCostSource" AS ENUM ('PRECO_CADASTRO', 'CUSTO_ESTOQUE', 'INFORMADO_MANUALMENTE', 'ESTIMADO_LEGADO');
CREATE TYPE "WorkScheduleStatus" AS ENUM ('ATIVA', 'INATIVA', 'CANCELADA');
ALTER TYPE "EpiMovementType" ADD VALUE IF NOT EXISTS 'SUBSTITUICAO';
ALTER TYPE "EmployeeOccurrenceType" ADD VALUE IF NOT EXISTS 'AFASTAMENTO';
ALTER TYPE "EmployeeOccurrenceType" ADD VALUE IF NOT EXISTS 'FERIAS';

ALTER TABLE "Employee"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "positionId" TEXT,
  ADD COLUMN "costCenterId" TEXT,
  ADD COLUMN "teamId" TEXT;

ALTER TABLE "EmployeeOccurrence"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "hoursAway" DECIMAL(8,2),
  ADD COLUMN "isJustified" BOOLEAN,
  ADD COLUMN "reasonId" TEXT,
  ADD COLUMN "status" "OccurrenceStatus" NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "registeredById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Epi"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "unitId" TEXT;

ALTER TABLE "EpiDelivery"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "unitCostSnapshot" DECIMAL(14,4),
  ADD COLUMN "costSource" "EpiCostSource",
  ADD COLUMN "isEstimatedCost" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "departmentSnapshot" TEXT,
  ADD COLUMN "positionSnapshot" TEXT,
  ADD COLUMN "costCenterSnapshot" TEXT,
  ADD COLUMN "movementReason" TEXT;

ALTER TABLE "Attachment"
  ADD COLUMN "employeeOccurrenceId" TEXT,
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "uploadedById" TEXT,
  ADD COLUMN "isSensitive" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Position" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostCenter" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "departmentId" TEXT,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkShift" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkShift_startMinute_check" CHECK ("startMinute" >= 0 AND "startMinute" < 1440),
  CONSTRAINT "WorkShift_endMinute_check" CHECK ("endMinute" >= 0 AND "endMinute" < 1440)
);

CREATE TABLE "WorkSchedule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "employeeId" TEXT NOT NULL,
  "teamId" TEXT,
  "shiftId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "seriesId" TEXT,
  "status" "WorkScheduleStatus" NOT NULL DEFAULT 'ATIVA',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkSchedule_period_check" CHECK ("endAt" > "startAt")
);

CREATE TABLE "AbsenceReason" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "occurrenceType" "EmployeeOccurrenceType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbsenceReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "role" "UserRole" NOT NULL,
  "permission" "HrPermission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "permission")
);

CREATE TABLE "UserCompanyAccess" (
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCompanyAccess_pkey" PRIMARY KEY ("userId", "companyId")
);

CREATE TABLE "UserUnitAccess" (
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserUnitAccess_pkey" PRIMARY KEY ("userId", "unitId")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "unitId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Unit_companyId_name_key" ON "Unit"("companyId", "name");
CREATE INDEX "Unit_companyId_isActive_idx" ON "Unit"("companyId", "isActive");
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");
CREATE UNIQUE INDEX "Position_companyId_name_key" ON "Position"("companyId", "name");
CREATE UNIQUE INDEX "CostCenter_companyId_code_key" ON "CostCenter"("companyId", "code");
CREATE UNIQUE INDEX "Team_companyId_name_key" ON "Team"("companyId", "name");
CREATE INDEX "Team_companyId_unitId_isActive_idx" ON "Team"("companyId", "unitId", "isActive");
CREATE UNIQUE INDEX "WorkShift_companyId_name_key" ON "WorkShift"("companyId", "name");
CREATE UNIQUE INDEX "AbsenceReason_companyId_name_key" ON "AbsenceReason"("companyId", "name");
CREATE INDEX "Employee_companyId_unitId_isActive_idx" ON "Employee"("companyId", "unitId", "isActive");
CREATE INDEX "Employee_companyId_departmentId_idx" ON "Employee"("companyId", "departmentId");
CREATE INDEX "Employee_admissionDate_idx" ON "Employee"("admissionDate");
CREATE INDEX "Employee_dismissalDate_idx" ON "Employee"("dismissalDate");
CREATE INDEX "EmployeeOccurrence_companyId_unitId_startDate_status_idx" ON "EmployeeOccurrence"("companyId", "unitId", "startDate", "status");
CREATE INDEX "EmployeeOccurrence_employeeId_startDate_idx" ON "EmployeeOccurrence"("employeeId", "startDate");
CREATE INDEX "Epi_companyId_unitId_isActive_idx" ON "Epi"("companyId", "unitId", "isActive");
CREATE INDEX "EpiDelivery_companyId_unitId_date_idx" ON "EpiDelivery"("companyId", "unitId", "date");
CREATE INDEX "EpiDelivery_employeeId_date_idx" ON "EpiDelivery"("employeeId", "date");
CREATE INDEX "EpiDelivery_epiId_date_idx" ON "EpiDelivery"("epiId", "date");
CREATE INDEX "Attachment_employeeOccurrenceId_idx" ON "Attachment"("employeeOccurrenceId");
CREATE INDEX "Attachment_companyId_isSensitive_idx" ON "Attachment"("companyId", "isSensitive");
CREATE INDEX "WorkSchedule_companyId_unitId_startAt_endAt_idx" ON "WorkSchedule"("companyId", "unitId", "startAt", "endAt");
CREATE INDEX "WorkSchedule_employeeId_startAt_endAt_status_idx" ON "WorkSchedule"("employeeId", "startAt", "endAt", "status");
CREATE INDEX "WorkSchedule_seriesId_idx" ON "WorkSchedule"("seriesId");
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AbsenceReason" ADD CONSTRAINT "AbsenceReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "AbsenceReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Epi" ADD CONSTRAINT "Epi_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Epi" ADD CONSTRAINT "Epi_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EpiDelivery" ADD CONSTRAINT "EpiDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EpiDelivery" ADD CONSTRAINT "EpiDelivery_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_employeeOccurrenceId_fkey" FOREIGN KEY ("employeeOccurrenceId") REFERENCES "EmployeeOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Perfis recebem um conjunto conservador de permissoes. Administradores recebem todas.
INSERT INTO "RolePermission" ("role", "permission")
SELECT 'ADMIN'::"UserRole", value::"HrPermission" FROM unnest(enum_range(NULL::"HrPermission")) AS value;

INSERT INTO "RolePermission" ("role", "permission") VALUES
  ('SEGURANCA_DO_TRABALHO', 'HR_ACCESS'), ('SEGURANCA_DO_TRABALHO', 'HR_DASHBOARD_VIEW'),
  ('SEGURANCA_DO_TRABALHO', 'EPI_VIEW'), ('SEGURANCA_DO_TRABALHO', 'EPI_MANAGE'),
  ('SEGURANCA_DO_TRABALHO', 'EPI_COST_VIEW'), ('SEGURANCA_DO_TRABALHO', 'EMPLOYEE_VIEW'),
  ('SEGURANCA_DO_TRABALHO', 'EMPLOYEE_MANAGE'), ('SEGURANCA_DO_TRABALHO', 'SCHEDULE_VIEW'),
  ('SEGURANCA_DO_TRABALHO', 'SCHEDULE_MANAGE'),
  ('SEGURANCA_DO_TRABALHO', 'OCCURRENCE_REGISTER'), ('SEGURANCA_DO_TRABALHO', 'OCCURRENCE_REVIEW'),
  ('SEGURANCA_DO_TRABALHO', 'DOCUMENT_VIEW'), ('SEGURANCA_DO_TRABALHO', 'REPORT_EXPORT'),
  ('SEGURANCA_DO_TRABALHO', 'CATALOG_MANAGE'),
  ('ALMOXARIFADO', 'HR_ACCESS'), ('ALMOXARIFADO', 'EPI_VIEW'), ('ALMOXARIFADO', 'EPI_MANAGE'),
  ('ALMOXARIFADO', 'EMPLOYEE_VIEW'), ('ALMOXARIFADO', 'REPORT_EXPORT'),
  ('MANUTENCAO', 'HR_ACCESS'), ('MANUTENCAO', 'EMPLOYEE_VIEW'), ('MANUTENCAO', 'SCHEDULE_VIEW');

-- Backfill somente quando a base possui exatamente uma empresa inequivoca.
DO $$
DECLARE
  v_company_id TEXT;
  v_unit_id TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM "Company") = 1 THEN
    SELECT "id" INTO v_company_id FROM "Company" LIMIT 1;
    v_unit_id := 'unit_' || md5(v_company_id || ':legacy');

    INSERT INTO "Unit" ("id", "companyId", "name", "code", "updatedAt")
    VALUES (v_unit_id, v_company_id, 'Unidade não informada (legado)', 'LEGACY', CURRENT_TIMESTAMP)
    ON CONFLICT ("companyId", "name") DO NOTHING;

    SELECT "id" INTO v_unit_id FROM "Unit" WHERE "companyId" = v_company_id AND "code" = 'LEGACY' LIMIT 1;

    UPDATE "Employee" SET "companyId" = v_company_id, "unitId" = v_unit_id WHERE "companyId" IS NULL;
    UPDATE "Epi" SET "companyId" = v_company_id, "unitId" = v_unit_id WHERE "companyId" IS NULL;

    INSERT INTO "Department" ("id", "companyId", "name", "updatedAt")
    SELECT 'dept_' || md5(v_company_id || ':' || lower(trim("department"))), v_company_id, trim("department"), CURRENT_TIMESTAMP
    FROM "Employee" WHERE trim("department") <> '' GROUP BY trim("department")
    ON CONFLICT ("companyId", "name") DO NOTHING;

    INSERT INTO "Position" ("id", "companyId", "name", "updatedAt")
    SELECT 'pos_' || md5(v_company_id || ':' || lower(trim("position"))), v_company_id, trim("position"), CURRENT_TIMESTAMP
    FROM "Employee" WHERE trim("position") <> '' GROUP BY trim("position")
    ON CONFLICT ("companyId", "name") DO NOTHING;

    UPDATE "Employee" employee SET "departmentId" = department."id"
    FROM "Department" department
    WHERE department."companyId" = v_company_id AND lower(trim(department."name")) = lower(trim(employee."department"));

    UPDATE "Employee" employee SET "positionId" = position_ref."id"
    FROM "Position" position_ref
    WHERE position_ref."companyId" = v_company_id AND lower(trim(position_ref."name")) = lower(trim(employee."position"));

    UPDATE "EmployeeOccurrence" occurrence
    SET "companyId" = employee."companyId", "unitId" = employee."unitId",
        "startDate" = occurrence."date",
        "endDate" = occurrence."date" + ((GREATEST(COALESCE(occurrence."daysAway", 1), 1) - 1) * INTERVAL '1 day'),
        "status" = 'APROVADO'
    FROM "Employee" employee
    WHERE occurrence."employeeId" = employee."id";

    UPDATE "EpiDelivery" delivery
    SET "companyId" = employee."companyId", "unitId" = employee."unitId",
        "departmentSnapshot" = employee."department", "positionSnapshot" = employee."position",
        "unitCostSnapshot" = epi."purchasePrice"::DECIMAL(14,4),
        "costSource" = CASE WHEN epi."purchasePrice" IS NULL THEN NULL ELSE 'ESTIMADO_LEGADO'::"EpiCostSource" END,
        "isEstimatedCost" = epi."purchasePrice" IS NOT NULL
    FROM "Employee" employee, "Epi" epi
    WHERE delivery."employeeId" = employee."id" AND delivery."epiId" = epi."id";

    INSERT INTO "UserCompanyAccess" ("userId", "companyId")
    SELECT "id", v_company_id FROM "User" ON CONFLICT DO NOTHING;
    INSERT INTO "UserUnitAccess" ("userId", "unitId")
    SELECT "id", v_unit_id FROM "User" ON CONFLICT DO NOTHING;
  END IF;
END $$;
