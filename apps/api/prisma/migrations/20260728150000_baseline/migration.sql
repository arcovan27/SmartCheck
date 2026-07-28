-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANUTENCAO', 'OPERADOR', 'SEGURANCA_DO_TRABALHO', 'ALMOXARIFADO');

-- CreateEnum
CREATE TYPE "BiometricStatus" AS ENUM ('SEM_BIOMETRIA', 'CADASTRADA', 'PENDENTE');

-- CreateEnum
CREATE TYPE "BiometricProvider" AS ENUM ('UAREU_4500', 'MOCK', 'OUTRO');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('MAQUINA', 'VEICULO', 'EQUIPAMENTO');

-- CreateEnum
CREATE TYPE "ChecklistPeriodicity" AS ENUM ('DIARIO', 'SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "ChecklistTemplateCode" AS ENUM ('PRENSA_TUBOS_MANUAL_01', 'PRENSA_TUBOS_MANUAL_02', 'MISTURADOR_MASSA_TUBOS', 'PA_CARREGADEIRA', 'EMPILHADEIRA_SEMANAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('OK_PROBLEMA_NA', 'SIM_NAO', 'NUMERO', 'TEXTO');

-- CreateEnum
CREATE TYPE "ChecklistOptionResult" AS ENUM ('OK', 'SEM_USO', 'PROBLEMA', 'NA');

-- CreateEnum
CREATE TYPE "EpiMovementType" AS ENUM ('ENTREGA', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "ConfirmationMethod" AS ENUM ('LOGIN', 'BIOMETRIA');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVA', 'CORRETIVA');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "MaintenancePlanTriggerType" AS ENUM ('DAYS', 'KM', 'HOURMETER');

-- CreateEnum
CREATE TYPE "MaintenancePlanAlertState" AS ENUM ('OK', 'NEAR', 'DUE');

-- CreateEnum
CREATE TYPE "EmployeeOccurrenceType" AS ENUM ('ATESTADO_MEDICO', 'FALTA', 'ADVERTENCIA', 'OUTRO');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "cpf" TEXT,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photoPath" TEXT,
    "admissionDate" TIMESTAMP(3),
    "dismissalDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeOccurrence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeOccurrenceType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "daysAway" INTEGER,
    "notes" TEXT,
    "attachmentPath" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBiometric" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "biometricTemplateId" TEXT,
    "biometricExternalId" TEXT,
    "provider" "BiometricProvider" NOT NULL,
    "status" "BiometricStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBiometric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ca" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "validityDate" TIMESTAMP(3),
    "unit" TEXT NOT NULL,
    "purchasePrice" DOUBLE PRECISION,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpiDelivery" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "epiId" TEXT NOT NULL,
    "movementType" "EpiMovementType" NOT NULL DEFAULT 'ENTREGA',
    "quantity" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsibleUserId" TEXT,
    "notes" TEXT,
    "confirmationMethod" "ConfirmationMethod" NOT NULL DEFAULT 'LOGIN',
    "confirmationBiometricId" TEXT,
    "employeeSignatureName" TEXT,
    "employeeConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpiDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "department" TEXT NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "hourmeter" DOUBLE PRECISION,
    "mileage" DOUBLE PRECISION,
    "manufacturer" TEXT,
    "assetTag" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "code" "ChecklistTemplateCode" NOT NULL DEFAULT 'OUTRO',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "periodicity" "ChecklistPeriodicity" NOT NULL,
    "equipmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateEquipment" (
    "templateId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplateEquipment_pkey" PRIMARY KEY ("templateId","equipmentId")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "instruction" TEXT,
    "itemType" "ChecklistItemType" NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "requiresObservationOnProblem" BOOLEAN NOT NULL DEFAULT true,
    "allowsPhotoOnProblem" BOOLEAN NOT NULL DEFAULT true,
    "requiresPhotoOnProblem" BOOLEAN NOT NULL DEFAULT false,
    "opensMaintenanceOnProblem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistExecution" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthReference" TEXT,
    "operatorName" TEXT,
    "secondaryOperatorName" TEXT,
    "hourmeterValue" DOUBLE PRECISION,
    "mileageValue" DOUBLE PRECISION,
    "workingHoursStartMonth" DOUBLE PRECISION,
    "fuelLevel" TEXT,
    "notes" TEXT,
    "hadProblem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistExecutionItem" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "optionResult" "ChecklistOptionResult",
    "booleanResult" BOOLEAN,
    "numericValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "observation" TEXT,
    "hadProblem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistExecutionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "checklistExecutionId" TEXT,
    "type" "MaintenanceType" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIA',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'ABERTA',
    "description" TEXT NOT NULL,
    "cause" TEXT,
    "responsibleId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concludedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "MaintenancePlanTriggerType" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "nearThreshold" DOUBLE PRECISION,
    "lastExecutionDate" TIMESTAMP(3),
    "lastExecutionValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "maintenanceId" TEXT,
    "checklistExecutionItemId" TEXT,
    "epiDeliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_registration_key" ON "Employee"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_cpf_key" ON "Employee"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBiometric_employeeId_key" ON "EmployeeBiometric"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Epi_name_ca_key" ON "Epi"("name", "ca");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_serialNumber_key" ON "Equipment"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- AddForeignKey
ALTER TABLE "EmployeeOccurrence" ADD CONSTRAINT "EmployeeOccurrence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBiometric" ADD CONSTRAINT "EmployeeBiometric_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpiDelivery" ADD CONSTRAINT "EpiDelivery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpiDelivery" ADD CONSTRAINT "EpiDelivery_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "Epi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpiDelivery" ADD CONSTRAINT "EpiDelivery_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateEquipment" ADD CONSTRAINT "ChecklistTemplateEquipment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateEquipment" ADD CONSTRAINT "ChecklistTemplateEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecutionItem" ADD CONSTRAINT "ChecklistExecutionItem_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ChecklistExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecutionItem" ADD CONSTRAINT "ChecklistExecutionItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ChecklistTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_checklistExecutionId_fkey" FOREIGN KEY ("checklistExecutionId") REFERENCES "ChecklistExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_checklistExecutionItemId_fkey" FOREIGN KEY ("checklistExecutionItemId") REFERENCES "ChecklistExecutionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_epiDeliveryId_fkey" FOREIGN KEY ("epiDeliveryId") REFERENCES "EpiDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
