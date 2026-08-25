import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("apps/web/src/components/AppLayout.tsx", "utf8");
const dashboard = readFileSync("apps/web/src/pages/DashboardPage.tsx", "utf8");
const features = readFileSync("apps/web/src/config/visualFeatures.ts", "utf8");

test("novo shell permanece protegido por feature flag com fallback legado", () => {
  assert.match(features, /VITE_ADMIN_SHELL_V2_ENABLED === "true"/);
  assert.match(layout, /visualFeatures\.adminShellV2Enabled \? <ExecutiveAppLayout \/> : <LegacyAppLayout \/>/);
});

test("menu executivo continua filtrado pelas permissões reais", () => {
  assert.match(layout, /userHasPermission\(user, item\.permission\)/);
  assert.match(layout, /Recursos Humanos/);
  for (const item of ["Pulso do RH", "EPI", "Funcionários", "Ocorrências", "Cadastro"]) assert.match(layout, new RegExp(item));
  assert.doesNotMatch(layout, /title: "Ficha de entrega"|title: "Movimentações de EPI"/);
});

test("drawer mobile preserva o body, suporta gesto vertical e fecha com segurança", () => {
  assert.match(layout, /const previousOverflow = document\.body\.style\.overflow/);
  assert.match(layout, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(layout, /event\.key === "Escape"/);
  assert.match(layout, /setMobileOpen\(false\)/);
  assert.match(layout, /aria-label="Fechar menu"/);
  assert.match(layout, /aria-expanded=\{mobileOpen\}/);
  assert.match(layout, /h-\[100dvh\]/);
  assert.match(layout, /smartcheck-sidebar-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto/);
  assert.match(layout, /role="dialog" aria-modal="true"/);
});

test("navegação reposiciona o container real e preserva retorno POP", () => {
  assert.match(layout, /contentRef\.current\?\.scrollTo/);
  assert.doesNotMatch(layout, /window\.scrollTo/);
  assert.match(layout, /navigationType === "POP"/);
  assert.match(layout, /positions\.current\.get\(location\.pathname\)/);
  assert.match(layout, /title\.focus\(\{ preventScroll: true \}\)/);
});

test("shell mobile limita a altura dinâmica e mantém o main rolável", () => {
  assert.match(layout, /flex h-screen h-\[100dvh\] min-h-0 overflow-hidden/);
  assert.match(layout, /flex h-full min-h-0 min-w-0 flex-1 flex-col/);
  assert.match(layout, /smartcheck-main-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto/);
});

test("dashboard executivo usa respostas reais, estados isolados e links existentes", () => {
  assert.match(dashboard, /dashboard\/summary/);
  assert.match(dashboard, /data\.modules\?\.purchases/);
  assert.match(dashboard, /data\.modules\?\.finance/);
  assert.match(dashboard, /sectionErrors/);
  assert.match(dashboard, /summary\.refetch\(\)/);
  assert.match(dashboard, /\/compras\/aprovacoes/);
  assert.match(dashboard, /\/financeiro\/contas-a-pagar/);
  assert.doesNotMatch(dashboard, /Math\.random|faker|mockData/);
});
