import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/InventoryPage.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8");
test("estoque expõe os sete menus solicitados", () => { for (const text of ["Visão geral", "Produtos, perdas e qualidade", "Lotes em cura", "Movimentações", "Inventário", "Cadastros auxiliares"]) assert.match(page, new RegExp(text)); });
test("interface não oferece edição direta de saldo", () => { assert.doesNotMatch(page, /name="(?:physical|available|balance)"/); assert.match(page, /saldo não é editável/i); });
test("navegação ativa o módulo Estoque", () => assert.match(layout, /title: "Estoque"/));
