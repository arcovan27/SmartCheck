import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../src/pages/hr/HrSchedulePage.tsx", import.meta.url);
const planningRoutePath = new URL("../../api/src/routes/hrWorkforcePlanning.ts", import.meta.url);

test("página operacional usa grade mensal e mantém planejamento separado do realizado", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /\/hr\/workforce\/grid/);
  assert.match(source, /Faixa superior: planejado\. Faixa inferior: realizado\./);
  assert.match(source, /attendance\?\.frequencyType\.shortCode/);
  assert.match(source, /aria-label=\{label\}/);
});

test("página oferece fechamento auditado e exportação protegida", async () => {
  const [page, route] = await Promise.all([readFile(pagePath, "utf8"), readFile(planningRoutePath, "utf8")]);
  assert.match(page, /\/hr\/workforce\/periods\/\$\{action\}/);
  assert.match(page, /\/hr\/workforce\/export/);
  assert.match(route, /HrPermission\.SCHEDULE_EXPORT/);
  assert.match(route, /WORKFORCE_SCHEDULE_EXPORT/);
});

test("importação nunca resolve AD silenciosamente", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /Bloquear para decisão/);
  assert.match(source, /Todos: auxílio-doença/);
  assert.match(source, /Todos: advertência/);
  assert.match(source, /Todos: falta justificada/);
});
