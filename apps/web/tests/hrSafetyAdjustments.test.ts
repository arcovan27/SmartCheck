import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/pages/hr/HrDashboardPrototypePage.tsx", import.meta.url), "utf8");
const indicators = readFileSync(new URL("../src/pages/hr/HrOccurrenceIndicatorsPage.tsx", import.meta.url), "utf8");
const catalogs = readFileSync(new URL("../src/pages/hr/HrCatalogsPrototypePage.tsx", import.meta.url), "utf8");
const employees = readFileSync(new URL("../src/pages/EmployeesPage.tsx", import.meta.url), "utf8");
const hrEmployees = readFileSync(new URL("../src/pages/hr/HrEmployeesPrototypePage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8");
const hrComponents = readFileSync(new URL("../src/pages/hr/HrPrototypeComponents.tsx", import.meta.url), "utf8");

test("Pulso usa Ocorrencias, envia datas civis e preserva filtros no detalhamento", () => {
  assert.match(dashboard, /label="Ocorrências"/);
  assert.match(dashboard, /params\.set\("startDate", filters\.startDate\)/);
  assert.match(dashboard, /indicadores-ocorrencias\?/);
  assert.match(indicators, /Registros rejeitados e cancelados não entram nos totais/);
  assert.match(indicators, /useSearchParams/);
});

test("exclusao de setor exige impacto, motivo, transferencia e nome de confirmacao", () => {
  assert.match(catalogs, /deletion-impact/);
  assert.match(catalogs, /targetDepartmentId/);
  assert.match(catalogs, /Motivo da exclusão/);
  assert.match(catalogs, /Digite “\{deleteTarget\.name\}” para confirmar/);
  assert.match(catalogs, /method: "DELETE"/);
});

test("inativacao exige motivo e data e confirma escalas futuras", () => {
  assert.match(employees, /TERMINATED_BY_COMPANY/);
  assert.match(employees, /VOLUNTARY_RESIGNATION/);
  assert.match(employees, /inactivation-impact/);
  assert.match(employees, /confirmFutureSchedules/);
  assert.match(employees, /Confirmar inativação/);
});

test("Nova ocorrencia oferece tipos novos e formularios condicionais", () => {
  assert.match(hrEmployees, /code: "ADVERT", label: "Advertência"/);
  assert.match(hrEmployees, /code: "SUSP", label: "Suspensão"/);
  assert.match(hrEmployees, /code: "ACID_TRAB", label: "Acidente de trabalho"/);
  assert.match(hrEmployees, /Data e hora do acidente/);
  assert.match(hrEmployees, /Houve afastamento\?/);
  assert.match(hrEmployees, /Motivo padronizado/);
});

test("cadastro de motivos usa os codigos centrais dos novos tipos", () => {
  assert.match(catalogs, /frequencyCode: form\.frequencyCode/);
  assert.match(catalogs, /option value="ADVERT"/);
  assert.match(catalogs, /option value="SUSP"/);
  assert.match(catalogs, /option value="ACID_TRAB"/);
  assert.doesNotMatch(catalogs, /occurrenceType: form\.occurrenceType/);
});

test("cards de ocorrencias filtram a lista e preservam a URL", () => {
  assert.match(indicators, /params\.set\("bucket", card\.bucket\)/);
  assert.match(indicators, /label: "Suspensões"/);
  assert.match(indicators, /label: "Acidentes de trabalho"/);
  assert.match(indicators, /label: "Outros"/);
  assert.match(indicators, /Nova ocorrência/);
  assert.match(indicators, /method: editor\.item \? "PATCH" : "POST"/);
  assert.match(indicators, /method: "DELETE"/);
});

test("Escala fica fora da navegacao e a rota direta mostra indisponibilidade", () => {
  assert.match(layout, /!hrFeatures\.workScheduleEnabled/);
  assert.match(hrComponents, /hrFeatures\.workScheduleEnabled/);
  assert.match(app, /HrWorkScheduleUnavailablePage/);
  assert.match(app, /hrFeatures\.workScheduleEnabled \?/);
});

test("formulario evita duplo envio e usa chave idempotente", () => {
  assert.match(hrEmployees, /idempotencyKey/);
  assert.match(hrEmployees, /disabled=\{mutation\.isPending/);
  assert.match(indicators, /idempotencyKey: form\.idempotencyKey/);
  assert.match(indicators, /disabled=\{cancelMutation\.isPending\}/);
});
