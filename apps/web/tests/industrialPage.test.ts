import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/IndustrialPage.tsx", "utf8");
const app = readFileSync("apps/web/src/App.tsx", "utf8");
const layout = readFileSync("apps/web/src/components/AppLayout.tsx", "utf8");

test("navegacao conecta vendas, CRM, expedicao, estoque, producao e financeiro", () => {
  for (const path of ["forca-vendas/pedidos", "forca-vendas/crm", "expedicao/fretes", "path=\\\"estoque\\\"", "producao/controle", "financeiro/diesel"]) assert.match(app, new RegExp(path));
  for (const group of ["Força de Vendas", "Expedição", "title: \\\"Estoque\\\"", "Financeiro"]) assert.match(layout, new RegExp(group));
});

test("visoes usam dados reais de pedidos, fretes, lotes e CRM", () => {
  assert.match(page, /apiRequest<Summary>\("\/industrial\/summary"\)/);
  assert.match(page, /item\.balance/);
  assert.match(page, /cureReleaseAt/);
  assert.match(page, /chargedAmount/);
  assert.doesNotMatch(page, /Math\.random|mock|simulad/i);
});
