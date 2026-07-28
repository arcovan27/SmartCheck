-- Configuracao aditiva e retrocompativel. Registros existentes permanecem sem leitura obrigatoria.
CREATE TYPE "ChecklistReadingMode" AS ENUM ('NONE', 'HOURMETER', 'MILEAGE', 'BOTH');

ALTER TABLE "ChecklistTemplate"
ADD COLUMN "readingMode" "ChecklistReadingMode" NOT NULL DEFAULT 'NONE';

ALTER TABLE "ChecklistExecution"
ADD COLUMN "readingMode" "ChecklistReadingMode" NOT NULL DEFAULT 'NONE';
