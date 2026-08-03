import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const components = readFileSync(new URL("../src/pages/hr/HrPrototypeComponents.tsx", import.meta.url), "utf8");
const deliveryRoute = readFileSync(new URL("../src/pages/hr/HrEpiDeliveryRoute.tsx", import.meta.url), "utf8");
const epiPage = readFileSync(new URL("../src/pages/hr/HrEpiPrototypePage.tsx", import.meta.url), "utf8");
const historySection = readFileSync(new URL("../src/pages/hr/HrEpiHistoryPage.tsx", import.meta.url), "utf8");

test("menu de RH exibe somente as cinco áreas principais e EPI não possui submenu", () => {
  const menuBlock = layout.match(/const recursosHumanosMenu = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.match(menuBlock, /Pulso do RH/);
  assert.match(menuBlock, /label: "EPI"/);
  assert.match(menuBlock, /Funcionarios/);
  assert.match(menuBlock, /Ocorrencias/);
  assert.match(menuBlock, /Cadastro/);
  assert.doesNotMatch(menuBlock, /Dashboard de EPI|Ficha de entrega|Movimentações|Histórico|Escala de trabalho/);
  assert.doesNotMatch(layout, /const epiMenu/);
  assert.doesNotMatch(components, /EpiSectionTabs|Seções de EPI|Dashboard de EPI/);
});

test("página única de EPI contém indicadores, entrega, movimentações e histórico", () => {
  assert.match(epiPage, /title="Indicadores e custos"/);
  assert.match(epiPage, /Realizar entrega de EPI/);
  assert.match(epiPage, /Temporariamente indisponível/);
  assert.match(epiPage, /A entrega de EPI está temporariamente indisponível\./);
  assert.match(epiPage, /id="movimentacoes"/);
  assert.match(epiPage, /HrEpiHistorySection/);
  assert.match(historySection, /id="historico"/);
  assert.match(historySection, /hr-epi-movement-filters/);
  assert.match(historySection, /Valor unitário/);
  assert.match(historySection, /Valor total/);
  assert.ok(epiPage.indexOf('title="Indicadores e custos"') < epiPage.indexOf('title="Entrega de EPI"'));
  assert.ok(epiPage.indexOf('id="movimentacoes"') < epiPage.indexOf("<HrEpiHistorySection"));
});

test("rotas antigas redirecionam para as seções da página única", () => {
  assert.match(app, /recursos-humanos\/epi#movimentacoes/);
  assert.match(app, /recursos-humanos\/epi#historico/);
  assert.doesNotMatch(app, /<HrEpiHistoryPage/);
});

test("rota direta da entrega respeita a flag e não monta o formulário desabilitado", () => {
  assert.match(app, /HrEpiDeliveryRoute/);
  assert.match(deliveryRoute, /featuresQuery\.data\?\.deliveryFormEnabled/);
  assert.match(deliveryRoute, /A entrega de EPI está temporariamente indisponível\./);
  assert.doesNotMatch(deliveryRoute, /EpiSectionTabs/);
});

test("movimentações usam endpoint próprio e chave contra reenvio", () => {
  assert.match(epiPage, /apiRequest\("\/hr\/epi-movements"/);
  assert.match(epiPage, /requestId: crypto\.randomUUID\(\)/);
  assert.match(epiPage, /disabled=\{createMovement\.isPending\}/);
});
