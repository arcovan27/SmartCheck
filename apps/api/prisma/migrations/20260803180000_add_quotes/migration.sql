-- PROPOSTA NAO EXECUTADA. Mudanca aditiva para homologacao previa.
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_VIEW';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_CREATE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_EDIT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_ISSUE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_DECIDE';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_CANCEL';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_DOCUMENT';
ALTER TYPE "HrPermission" ADD VALUE IF NOT EXISTS 'QUOTE_VALUE_VIEW';

CREATE TYPE "QuoteStatus" AS ENUM ('RASCUNHO', 'EMITIDO', 'APROVADO', 'REJEITADO', 'VENCIDO', 'CANCELADO');
CREATE TYPE "CatalogItemType" AS ENUM ('PRODUTO', 'SERVICO');

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT,
  "document" TEXT,
  "addressLine" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "responsibleContact" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogItem" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "CatalogItemType" NOT NULL DEFAULT 'PRODUTO',
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSequence" (
  "companyId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteSequence_pkey" PRIMARY KEY ("companyId", "year")
);

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "customerId" TEXT,
  "number" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "sequenceYear" INTEGER NOT NULL,
  "issueDate" DATE NOT NULL,
  "validityDate" DATE NOT NULL,
  "paymentTerms" TEXT,
  "deliveryForecast" TEXT,
  "commercialNotes" TEXT,
  "notes" TEXT,
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "surchargeTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "QuoteStatus" NOT NULL DEFAULT 'RASCUNHO',
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "commercialOwnerId" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "idempotencyKey" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Quote_validity_check" CHECK ("validityDate" >= "issueDate"),
  CONSTRAINT "Quote_financial_check" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "surchargeTotal" >= 0 AND "total" >= 0)
);

CREATE TABLE "QuoteItem" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "position" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteItem_values_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discount" >= 0 AND "total" >= 0)
);

CREATE TABLE "QuoteVersion" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "unitId" TEXT,
  "quoteId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_companyId_document_key" ON "Customer"("companyId", "document");
CREATE INDEX "Customer_companyId_legalName_isActive_idx" ON "Customer"("companyId", "legalName", "isActive");
CREATE UNIQUE INDEX "CatalogItem_companyId_code_key" ON "CatalogItem"("companyId", "code");
CREATE INDEX "CatalogItem_companyId_description_isActive_idx" ON "CatalogItem"("companyId", "description", "isActive");
CREATE UNIQUE INDEX "Quote_companyId_number_key" ON "Quote"("companyId", "number");
CREATE UNIQUE INDEX "Quote_companyId_idempotencyKey_key" ON "Quote"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "Quote_companyId_sequenceYear_sequenceNumber_key" ON "Quote"("companyId", "sequenceYear", "sequenceNumber");
CREATE INDEX "Quote_companyId_unitId_status_issueDate_idx" ON "Quote"("companyId", "unitId", "status", "issueDate");
CREATE INDEX "Quote_companyId_customerId_deletedAt_idx" ON "Quote"("companyId", "customerId", "deletedAt");
CREATE UNIQUE INDEX "QuoteItem_quoteId_position_key" ON "QuoteItem"("quoteId", "position");
CREATE INDEX "QuoteItem_catalogItemId_idx" ON "QuoteItem"("catalogItemId");
CREATE UNIQUE INDEX "QuoteVersion_quoteId_version_key" ON "QuoteVersion"("quoteId", "version");
CREATE INDEX "QuoteHistory_quoteId_createdAt_idx" ON "QuoteHistory"("quoteId", "createdAt");
CREATE INDEX "QuoteHistory_companyId_unitId_createdAt_idx" ON "QuoteHistory"("companyId", "unitId", "createdAt");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteSequence" ADD CONSTRAINT "QuoteSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_commercialOwnerId_fkey" FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteVersion" ADD CONSTRAINT "QuoteVersion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteHistory" ADD CONSTRAINT "QuoteHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteHistory" ADD CONSTRAINT "QuoteHistory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteHistory" ADD CONSTRAINT "QuoteHistory_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteHistory" ADD CONSTRAINT "QuoteHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
