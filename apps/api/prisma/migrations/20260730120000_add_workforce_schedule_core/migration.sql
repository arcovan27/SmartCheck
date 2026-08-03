-- SmartCheck RH - escala planejada e frequencia realizada.
-- Migracao exclusivamente aditiva. Nao importar planilhas nem remover dados existentes.

ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_CREATE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_EDIT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_BULK_EDIT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'FREQUENCY_REGISTER';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'CERTIFICATE_REGISTER';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'CERTIFICATE_APPROVE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_PERIOD_CLOSE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_PERIOD_REOPEN';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_IMPORT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SCHEDULE_EXPORT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SHIFT_MANAGE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'FREQUENCY_TYPE_MANAGE';

CREATE TYPE "ScheduleDayType" AS ENUM ('WORK', 'DSR', 'DAY_OFF', 'HOLIDAY');
CREATE TYPE "ScheduleOrigin" AS ENUM ('LEGACY', 'PATTERN', 'MANUAL', 'COPY', 'IMPORT', 'EXCEPTION');
CREATE TYPE "SchedulePatternType" AS ENUM ('WEEKLY', 'CYCLE', 'CUSTOM', 'FLEXIBLE');
CREATE TYPE "ScheduleAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELLED');
CREATE TYPE "FrequencyCategory" AS ENUM ('PRESENCE', 'REST', 'JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'LEAVE', 'CALENDAR', 'DISCIPLINARY');
CREATE TYPE "SchedulePeriodStatus" AS ENUM ('OPEN', 'REVIEW', 'CLOSED', 'REOPENED');
CREATE TYPE "HolidayScope" AS ENUM ('NATIONAL', 'STATE', 'CITY', 'COMPANY', 'UNIT');
CREATE TYPE "ScheduleImportStatus" AS ENUM ('VALIDATING', 'REVIEW_REQUIRED', 'READY', 'IMPORTED', 'FAILED', 'CANCELLED');
CREATE TYPE "ScheduleImportItemStatus" AS ENUM ('READY', 'EMPLOYEE_NOT_FOUND', 'EMPLOYEE_SUGGESTED', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_INACTIVE', 'CODE_NOT_FOUND', 'CODE_AMBIGUOUS', 'CONFLICT', 'IGNORED', 'IMPORTED');

ALTER TABLE "WorkShift"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plannedMinutes" INTEGER,
  ADD COLUMN "color" TEXT;

ALTER TABLE "WorkSchedule"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "assignmentId" TEXT,
  ADD COLUMN "patternDayId" TEXT,
  ADD COLUMN "scheduleDate" DATE,
  ADD COLUMN "dayType" "ScheduleDayType" NOT NULL DEFAULT 'WORK',
  ADD COLUMN "origin" "ScheduleOrigin" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plannedMinutes" INTEGER;

UPDATE "WorkSchedule"
SET
  "scheduleDate" = ("startAt" AT TIME ZONE 'America/Sao_Paulo')::date,
  "plannedMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("endAt" - "startAt")) / 60)::integer - "breakMinutes")
WHERE "scheduleDate" IS NULL OR "plannedMinutes" IS NULL;

CREATE TABLE "SchedulePattern" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "patternType" "SchedulePatternType" NOT NULL,
  "cycleDays" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulePattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePatternDay" (
  "id" TEXT NOT NULL,
  "patternId" TEXT NOT NULL,
  "cyclePosition" INTEGER NOT NULL,
  "dayType" "ScheduleDayType" NOT NULL,
  "shiftId" TEXT,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "plannedMinutes" INTEGER,
  "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SchedulePatternDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleAssignment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "patternId" TEXT NOT NULL,
  "unitId" TEXT,
  "departmentId" TEXT,
  "teamId" TEXT,
  "validFrom" DATE NOT NULL,
  "validUntil" DATE,
  "cycleOffset" INTEGER NOT NULL DEFAULT 0,
  "status" "ScheduleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FrequencyType" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "FrequencyCategory" NOT NULL,
  "color" TEXT NOT NULL,
  "icon" TEXT,
  "countsAsPresence" BOOLEAN NOT NULL DEFAULT false,
  "countsAsAbsence" BOOLEAN NOT NULL DEFAULT false,
  "justifiedAbsence" BOOLEAN NOT NULL DEFAULT false,
  "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "affectsPlannedHours" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FrequencyType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyAttendance" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "workScheduleId" TEXT,
  "frequencyTypeId" TEXT NOT NULL,
  "occurrenceId" TEXT,
  "hours" DECIMAL(8,2),
  "days" DECIMAL(6,2),
  "notes" TEXT,
  "status" "OccurrenceStatus" NOT NULL DEFAULT 'PENDENTE',
  "origin" "ScheduleOrigin" NOT NULL DEFAULT 'MANUAL',
  "importItemId" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePeriod" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "competence" DATE NOT NULL,
  "status" "SchedulePeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closeReason" TEXT,
  "reopenReason" TEXT,
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulePeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Holiday" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "scope" "HolidayScope" NOT NULL,
  "state" TEXT,
  "city" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleImportBatch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "sheetName" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "originalName" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "status" "ScheduleImportStatus" NOT NULL DEFAULT 'VALIDATING',
  "adDecision" JSONB,
  "summary" JSONB,
  "createdById" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleImportItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "sourceEmployeeKey" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceRegistration" TEXT,
  "employeeId" TEXT,
  "date" DATE,
  "sourceCode" TEXT NOT NULL,
  "frequencyTypeId" TEXT,
  "status" "ScheduleImportItemStatus" NOT NULL,
  "issue" JSONB,
  "sourcePayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleImportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkShift_companyId_code_key" ON "WorkShift"("companyId", "code");
CREATE INDEX "WorkShift_companyId_isActive_idx" ON "WorkShift"("companyId", "isActive");
CREATE INDEX "WorkSchedule_companyId_unitId_scheduleDate_status_idx" ON "WorkSchedule"("companyId", "unitId", "scheduleDate", "status");
CREATE INDEX "WorkSchedule_companyId_departmentId_scheduleDate_idx" ON "WorkSchedule"("companyId", "departmentId", "scheduleDate");
CREATE INDEX "WorkSchedule_employeeId_scheduleDate_status_idx" ON "WorkSchedule"("employeeId", "scheduleDate", "status");
CREATE INDEX "WorkSchedule_assignmentId_scheduleDate_idx" ON "WorkSchedule"("assignmentId", "scheduleDate");
CREATE UNIQUE INDEX "WorkSchedule_assignment_employee_date_active_key" ON "WorkSchedule"("assignmentId", "employeeId", "scheduleDate") WHERE "status" = 'ATIVA' AND "assignmentId" IS NOT NULL AND "scheduleDate" IS NOT NULL;

CREATE UNIQUE INDEX "SchedulePattern_companyId_code_key" ON "SchedulePattern"("companyId", "code");
CREATE UNIQUE INDEX "SchedulePattern_companyId_name_key" ON "SchedulePattern"("companyId", "name");
CREATE INDEX "SchedulePattern_companyId_isActive_idx" ON "SchedulePattern"("companyId", "isActive");
CREATE UNIQUE INDEX "SchedulePatternDay_patternId_cyclePosition_key" ON "SchedulePatternDay"("patternId", "cyclePosition");
CREATE INDEX "SchedulePatternDay_shiftId_idx" ON "SchedulePatternDay"("shiftId");
CREATE INDEX "ScheduleAssignment_companyId_unitId_validFrom_validUntil_status_idx" ON "ScheduleAssignment"("companyId", "unitId", "validFrom", "validUntil", "status");
CREATE INDEX "ScheduleAssignment_employeeId_validFrom_validUntil_status_idx" ON "ScheduleAssignment"("employeeId", "validFrom", "validUntil", "status");
CREATE INDEX "ScheduleAssignment_patternId_status_idx" ON "ScheduleAssignment"("patternId", "status");

CREATE UNIQUE INDEX "FrequencyType_companyId_code_key" ON "FrequencyType"("companyId", "code");
CREATE UNIQUE INDEX "FrequencyType_companyId_shortCode_key" ON "FrequencyType"("companyId", "shortCode");
CREATE INDEX "FrequencyType_companyId_category_isActive_idx" ON "FrequencyType"("companyId", "category", "isActive");
CREATE UNIQUE INDEX "DailyAttendance_importItemId_key" ON "DailyAttendance"("importItemId");
CREATE UNIQUE INDEX "DailyAttendance_employee_date_active_key" ON "DailyAttendance"("companyId", "employeeId", "date") WHERE "deletedAt" IS NULL;
CREATE INDEX "DailyAttendance_companyId_unitId_date_status_idx" ON "DailyAttendance"("companyId", "unitId", "date", "status");
CREATE INDEX "DailyAttendance_employeeId_date_deletedAt_idx" ON "DailyAttendance"("employeeId", "date", "deletedAt");
CREATE INDEX "DailyAttendance_frequencyTypeId_date_status_idx" ON "DailyAttendance"("frequencyTypeId", "date", "status");
CREATE INDEX "DailyAttendance_workScheduleId_idx" ON "DailyAttendance"("workScheduleId");
CREATE INDEX "DailyAttendance_occurrenceId_idx" ON "DailyAttendance"("occurrenceId");

CREATE UNIQUE INDEX "SchedulePeriod_company_competence_key" ON "SchedulePeriod"("companyId", "competence") WHERE "unitId" IS NULL;
CREATE UNIQUE INDEX "SchedulePeriod_unit_competence_key" ON "SchedulePeriod"("companyId", "unitId", "competence") WHERE "unitId" IS NOT NULL;
CREATE INDEX "SchedulePeriod_companyId_unitId_competence_status_idx" ON "SchedulePeriod"("companyId", "unitId", "competence", "status");
CREATE UNIQUE INDEX "Holiday_company_scope_key" ON "Holiday"("companyId", "date", "name") WHERE "unitId" IS NULL;
CREATE UNIQUE INDEX "Holiday_unit_scope_key" ON "Holiday"("companyId", "unitId", "date", "name") WHERE "unitId" IS NOT NULL;
CREATE INDEX "Holiday_companyId_unitId_date_isActive_idx" ON "Holiday"("companyId", "unitId", "date", "isActive");

CREATE UNIQUE INDEX "ScheduleImportBatch_companyId_contentHash_sheetName_key" ON "ScheduleImportBatch"("companyId", "contentHash", "sheetName");
CREATE INDEX "ScheduleImportBatch_companyId_competence_status_idx" ON "ScheduleImportBatch"("companyId", "competence", "status");
CREATE UNIQUE INDEX "ScheduleImportItem_batchId_sourceEmployeeKey_date_key" ON "ScheduleImportItem"("batchId", "sourceEmployeeKey", "date");
CREATE INDEX "ScheduleImportItem_batchId_status_idx" ON "ScheduleImportItem"("batchId", "status");
CREATE INDEX "ScheduleImportItem_employeeId_date_idx" ON "ScheduleImportItem"("employeeId", "date");

ALTER TABLE "SchedulePattern" ADD CONSTRAINT "SchedulePattern_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternDay" ADD CONSTRAINT "SchedulePatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "SchedulePattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternDay" ADD CONSTRAINT "SchedulePatternDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "SchedulePattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_patternDayId_fkey" FOREIGN KEY ("patternDayId") REFERENCES "SchedulePatternDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FrequencyType" ADD CONSTRAINT "FrequencyType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_frequencyTypeId_fkey" FOREIGN KEY ("frequencyTypeId") REFERENCES "FrequencyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EmployeeOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "ScheduleImportItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleImportBatch" ADD CONSTRAINT "ScheduleImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleImportBatch" ADD CONSTRAINT "ScheduleImportBatch_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleImportBatch" ADD CONSTRAINT "ScheduleImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleImportItem" ADD CONSTRAINT "ScheduleImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleImportItem" ADD CONSTRAINT "ScheduleImportItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleImportItem" ADD CONSTRAINT "ScheduleImportItem_frequencyTypeId_fkey" FOREIGN KEY ("frequencyTypeId") REFERENCES "FrequencyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catalogo inicial por empresa. AD permanece reservado como codigo-fonte ambiguo no importador.
INSERT INTO "FrequencyType" (
  "id", "companyId", "code", "shortCode", "name", "category", "color",
  "countsAsPresence", "countsAsAbsence", "justifiedAbsence", "requiresDocument",
  "requiresApproval", "affectsPlannedHours", "isActive", "displayOrder", "updatedAt"
)
SELECT
  'freq_' || substr(md5(company."id" || ':' || seed.code), 1, 24),
  company."id", seed.code, seed.short_code, seed.name, seed.category::"FrequencyCategory", seed.color,
  seed.presence, seed.absence, seed.justified, seed.document, seed.approval, seed.affects_hours,
  true, seed.display_order, CURRENT_TIMESTAMP
FROM "Company" company
CROSS JOIN (VALUES
  ('TRAB', 'T', 'Trabalhou', 'PRESENCE', '#047857', true, false, false, false, false, false, 10),
  ('DSR', 'DSR', 'Descanso semanal remunerado', 'REST', '#475569', false, false, false, false, false, false, 20),
  ('ATEST', 'AT', 'Atestado', 'JUSTIFIED_ABSENCE', '#0284c7', false, true, true, true, true, true, 30),
  ('FALTA_INJ', 'IN', 'Falta injustificada', 'UNJUSTIFIED_ABSENCE', '#dc2626', false, true, false, false, false, true, 40),
  ('AUX_DOENCA', 'AUX', 'Auxilio-doenca', 'LEAVE', '#2563eb', false, true, true, true, true, true, 50),
  ('FERIAS', 'FE', 'Ferias', 'LEAVE', '#7c3aed', false, true, true, false, true, true, 60),
  ('FERIADO', 'FD', 'Feriado', 'CALENDAR', '#4f46e5', false, false, false, false, false, false, 70),
  ('EMENDA', 'EM', 'Emenda de feriado', 'CALENDAR', '#6366f1', false, false, false, false, true, true, 80),
  ('ADVERT', 'ADV', 'Advertencia', 'DISCIPLINARY', '#c2410c', false, false, false, false, true, false, 90),
  ('SUSP', 'SU', 'Suspensao', 'DISCIPLINARY', '#9a3412', false, true, false, false, true, true, 100),
  ('FALTA_JUST', 'FJ', 'Falta justificada', 'JUSTIFIED_ABSENCE', '#0891b2', false, true, true, false, true, true, 110),
  ('LIC_PAT', 'LP', 'Licenca-paternidade', 'LEAVE', '#0d9488', false, true, true, true, true, true, 120),
  ('ACOMP_FAMILIAR', 'AE', 'Acompanhamento familiar', 'JUSTIFIED_ABSENCE', '#0e7490', false, true, true, true, true, true, 130),
  ('ACID_TRAB', 'AC', 'Acidente de trabalho', 'LEAVE', '#b91c1c', false, true, true, true, true, true, 140),
  ('LIC_CAS', 'LC', 'Licenca-casamento', 'LEAVE', '#a855f7', false, true, true, true, true, true, 150),
  ('LIC_OBITO', 'LF', 'Licenca-falecimento', 'LEAVE', '#64748b', false, true, true, true, true, true, 160),
  ('DOENCA_FILHO', 'DF', 'Doenca de filho', 'JUSTIFIED_ABSENCE', '#0369a1', false, true, true, true, true, true, 170),
  ('INTERN_FILHO', 'IF', 'Internacao de filho', 'JUSTIFIED_ABSENCE', '#075985', false, true, true, true, true, true, 180),
  ('INTERN_CONJUGE', 'IE', 'Internacao de conjuge', 'JUSTIFIED_ABSENCE', '#155e75', false, true, true, true, true, true, 190),
  ('SERV_MILITAR', 'SM', 'Servico militar', 'LEAVE', '#334155', false, true, true, true, true, true, 200),
  ('JUST_ELEITORAL', 'JE', 'Justica eleitoral', 'JUSTIFIED_ABSENCE', '#0f766e', false, true, true, true, true, true, 210),
  ('AFAST_JUDICIAL', 'AJ', 'Afastamento judicial', 'LEAVE', '#7f1d1d', false, true, true, true, true, true, 220)
) AS seed(code, short_code, name, category, color, presence, absence, justified, document, approval, affects_hours, display_order)
ON CONFLICT ("companyId", "code") DO NOTHING;
