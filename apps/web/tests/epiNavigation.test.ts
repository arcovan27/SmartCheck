import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const components = readFileSync(new URL("../src/pages/hr/HrPrototypeComponents.tsx", import.meta.url), "utf8");
const deliveryRoute = readFileSync(new URL("../src/pages/hr/HrEpiDeliveryRoute.tsx", import.meta.url), "utf8");
const epiPage = readFileSync(new URL("../src/pages/hr/HrEpiPrototypePage.tsx", import.meta.url), "utf8");

test("menu lateral de RH exibe somente as cinco áreas principais", () => {
  const menuBlock = layout.match(/const recursosHumanosMenu = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.match(menuBlock, /Pulso do RH/);
  assert.match(menuBlock, /label: "EPI"/);
  assert.match(menuBlock, /Funcionarios/);
  assert.match(menuBlock, /Ocorrencias/);
  assert.match(menuBlock, /Cadastro/);
  assert.doesNotMatch(menuBlock, /Dashboard de EPI|Ficha de entrega|Movimentações|Histórico|Escala de trabalho/);
  assert.doesNotMatch(layout, /const epiMenu/);
});

test("opções detalhadas aparecem somente na navegação interna de EPI", () => {
  assert.match(components, /Dashboard de EPI/);
  assert.match(components, /Ficha de entrega/);
  assert.match(components, /Movimentações/);
  assert.match(components, /Histórico/);
  assert.match(components, /Temporariamente indisponível/);
  assert.match(components, /A Ficha de entrega de EPI está temporariamente indisponível\./);
});

test("rota direta da ficha respeita a flag e não monta o formulário desabilitado", () => {
  assert.match(app, /HrEpiDeliveryRoute/);
  assert.match(deliveryRoute, /featuresQuery\.data\?\.deliveryFormEnabled/);
  assert.match(deliveryRoute, /A Ficha de entrega de EPI está temporariamente indisponível\./);
});

test("movimentações usam endpoint próprio e chave contra reenvio", () => {
  assert.match(epiPage, /apiRequest\("\/hr\/epi-movements"/);
  assert.match(epiPage, /requestId: crypto\.randomUUID\(\)/);
  assert.match(epiPage, /disabled=\{createMovement\.isPending\}/);
});
