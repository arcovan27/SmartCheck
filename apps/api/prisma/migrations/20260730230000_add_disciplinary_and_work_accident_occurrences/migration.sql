-- Extensao aditiva do fluxo central de ocorrencias.
-- Nao executar em producao sem homologacao, backup e autorizacao expressa.

ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'OCCURRENCE_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'OCCURRENCE_EDIT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'OCCURRENCE_CANCEL';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'WARNING_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'WARNING_REGISTER';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SUSPENSION_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'SUSPENSION_REGISTER';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'WORK_ACCIDENT_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'WORK_ACCIDENT_REGISTER';

ALTER TABLE "EmployeeOccurrence"
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "frequencyTypeId" TEXT,
  ADD COLUMN "accidentOccurredAt" TIMESTAMP(3),
  ADD COLUMN "accidentLocation" TEXT,
  ADD COLUMN "hasAccidentLeave" BOOLEAN,
  ADD COLUMN "accidentLeaveStartDate" DATE,
  ADD COLUMN "accidentLeaveEndDate" DATE,
  ADD COLUMN "catNumber" TEXT;

ALTER TABLE "AbsenceReason"
  ADD COLUMN "frequencyTypeId" TEXT;

ALTER TABLE "Attachment"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE INDEX "EmployeeOccurrence_companyId_frequencyTypeId_startDate_status_idx"
  ON "EmployeeOccurrence"("companyId", "frequencyTypeId", "startDate", "status");
CREATE INDEX "EmployeeOccurrence_teamId_startDate_idx"
  ON "EmployeeOccurrence"("teamId", "startDate");
CREATE INDEX "AbsenceReason_companyId_frequencyTypeId_isActive_idx"
  ON "AbsenceReason"("companyId", "frequencyTypeId", "isActive");
DROP INDEX IF EXISTS "Attachment_employeeOccurrenceId_idx";
CREATE INDEX "Attachment_employeeOccurrenceId_deletedAt_idx"
  ON "Attachment"("employeeOccurrenceId", "deletedAt");

ALTER TABLE "EmployeeOccurrence"
  ADD CONSTRAINT "EmployeeOccurrence_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeOccurrence_frequencyTypeId_fkey"
    FOREIGN KEY ("frequencyTypeId") REFERENCES "FrequencyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AbsenceReason"
  ADD CONSTRAINT "AbsenceReason_frequencyTypeId_fkey"
    FOREIGN KEY ("frequencyTypeId") REFERENCES "FrequencyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Garante idempotencia e evita dois apontamentos realizados ativos para a mesma pessoa/data.
-- A verificacao interrompe a migracao sem alterar dados caso exista legado ambiguo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DailyAttendance"
    WHERE "deletedAt" IS NULL
    GROUP BY "employeeId", "date"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem apontamentos diarios ativos duplicados; resolva-os antes de prosseguir.';
  END IF;
END $$;

CREATE UNIQUE INDEX "DailyAttendance_employeeId_date_active_key"
  ON "DailyAttendance"("employeeId", "date")
  WHERE "deletedAt" IS NULL;

-- Acidente sem afastamento nao exige documento; anexos continuam opcionais e protegidos.
UPDATE "FrequencyType"
SET "requiresDocument" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ACID_TRAB';
