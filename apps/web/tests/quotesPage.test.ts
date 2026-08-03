import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const page = readFileSync(path.resolve("apps/web/src/pages/QuotesPage.tsx"), "utf8");
const layout = readFileSync(path.resolve("apps/web/src/components/AppLayout.tsx"), "utf8");
const app = readFileSync(path.resolve("apps/web/src/App.tsx"), "utf8");

test("menu possui um unico item Orçamentos e rota protegida direta", () => {
  assert.equal((layout.match(/label: "Orçamentos"/g) ?? []).length, 1);
  assert.match(layout, /to: "\/orcamentos"/);
  assert.match(app, /path="orcamentos"/);
  assert.match(app, /permission="QUOTE_VIEW"/);
});

test("pagina oferece indicadores, filtros, paginacao e fluxo completo", () => {
  for (const label of ["Total no período", "Em aberto", "Aprovados", "Rejeitados", "Vencidos", "Valor orçado", "Valor aprovado"]) assert.match(page, new RegExp(label));
  for (const action of ["Novo orçamento", "Visualizar", "Editar", "Duplicar", "Emitir", "Aprovar", "Rejeitar", "Cancelar", "Espelho", "PDF", "Imprimir"]) assert.match(page, new RegExp(action));
  for (const filter of ["number", "from", "to", "customerId", "responsibleId", "companyId", "unitId", "status"]) assert.match(page, new RegExp(filter));
});

test("frontend bloqueia duplo envio e baixa PDF autenticado sem URL externa", () => {
  assert.match(page, /disabled=\{saveMutation\.isPending\}/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /Authorization: `Bearer \$\{token\}`/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /contentWindow\?\.print\(\)/);
});
