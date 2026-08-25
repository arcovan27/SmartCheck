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

test("pagina oferece indicadores e fluxo integrado", () => {
  for (const label of ["Orçamentos", "Em aberto", "Aprovados", "Expirados", "Valor orçado"]) assert.match(page, new RegExp(label));
  for (const action of ["Novo orçamento", "Editar", "Emitir", "Marcar enviado", "Aprovar", "Gerar pedido", "Imprimir/PDF"]) assert.match(page, new RegExp(action));
  for (const filter of ["number", "status"]) assert.match(page, new RegExp(filter));
});

test("formulario e simplificado, sem selecao de empresa ou unidade", () => {
  for (const label of ["Nome", "Telefone", "Local de entrega", "Condição de pagamento", "Responsável comercial", "Este pedido possui comissão", "SHVENDAS", "WEBMAIS"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /form\.companyId/);
  assert.doesNotMatch(page, /form\.unitId/);
  assert.match(page, /quote-customers\/search/);
  assert.match(page, /Catálogo de produtos/);
  assert.doesNotMatch(page, /Desconto/);
});

test("frontend bloqueia duplo envio e baixa PDF autenticado", () => {
  assert.match(page, /disabled=\{saveMutation\.isPending\}/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /Authorization: `Bearer \$\{token\}`/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /window\.open/);
});
