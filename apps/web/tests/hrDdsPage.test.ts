import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/src/pages/SafetyPeoplePage.tsx", "utf8");
const catalogs = readFileSync("apps/web/src/pages/hr/HrCatalogsPrototypePage.tsx", "utf8");
const app = readFileSync("apps/web/src/App.tsx", "utf8");
const layout = readFileSync("apps/web/src/components/AppLayout.tsx", "utf8");

test("DDS fica somente no módulo Segurança e Pessoas", () => {
  assert.doesNotMatch(catalogs, /\/recursos-humanos\/cadastros\/dds/);
  assert.doesNotMatch(app, /recursos-humanos\/cadastros\/dds/);
  assert.match(app, /seguranca-pessoas/);
  assert.match(app, /<SafetyPeoplePage/);
  assert.match(layout, /Segurança e Pessoas/);
});

test("DDS reutiliza o motor central e apresenta participantes, respostas e histórico", () => {
  for (const label of ["Tema", "Responsável", "Participantes", "Usuário do lançamento", "Respostas", "Observações", "Assinaturas", "Auditoria"]) assert.match(page, new RegExp(label));
  assert.match(page, /getUploadedFileUrl/);
  assert.match(page, /\/safety-people\/dds/);
  assert.match(page, /\/checklist-executions/);
  assert.match(page, /participantIds/);
});

test("tela DDS não apresenta campos próprios de máquina", () => {
  assert.doesNotMatch(page, /Série|Horímetro|Quilometragem|Patrimônio|Tipo “Máquina”|Tipo “Equipamento”/i);
});
