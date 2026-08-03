-- Mudanca aditiva. Nao aplicar em producao sem homologacao e autorizacao expressa.
ALTER TYPE "EmployeeOccurrenceType" ADD VALUE IF NOT EXISTS 'SUSPENSAO';
ALTER TYPE "EmployeeOccurrenceType" ADD VALUE IF NOT EXISTS 'ACIDENTE_TRABALHO';

ALTER TABLE "EmployeeOccurrence"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeOccurrence_companyId_idempotencyKey_key"
  ON "EmployeeOccurrence"("companyId", "idempotencyKey");
