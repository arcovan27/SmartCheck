import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("apps/web/src/components/AppLayout.tsx", "utf8");
const identity = readFileSync("apps/web/src/components/BrandIdentity.tsx", "utf8");
const executiveNavigation = layout.slice(layout.indexOf("function executiveNavigation"), layout.indexOf("function NavGlyph"));
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

test("grupos iniciam recolhidos e funcionam como acordeão acessível", () => {
  assert.match(layout, /useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(layout, /current\[key\] \? \{\} : \{ \[key\]: true \}/);
  assert.match(layout, /openGroups\[group\.key\] \?\? false/);
  assert.match(layout, /aria-expanded=\{expanded\}/);
  assert.match(layout, /setCompact\(false\);\s*setOpenGroups\(\{ \[key\]: true \}\)/);
  assert.doesNotMatch(layout, /openGroups\[group\.key\] \?\? true/);
});

test("busca expande apenas resultados e volta ao estado recolhido ao limpar", () => {
  assert.match(layout, /const expanded = normalizedSearch \? true :/);
  assert.match(layout, /if \(!visibleItems\.length\) return null/);
  assert.match(layout, /if \(!value\.trim\(\)\) setOpenGroups\(\{\}\)/);
  assert.match(layout, /onChange=\{\(event\) => handleSearchChange\(event\.target\.value\)\}/);
});

test("hierarquia executiva mantém ordem e rótulos aprovados", () => {
  const titles = ["Gestão Arcovan", "Operação Arcovan", "Comercial", "Compras e Suprimentos", "Financeiro", "Estoque e Expedição", "Manutenção", "Segurança e Pessoas", "Recursos Humanos", "Administração"];
  let previous = -1;
  for (const title of titles) {
    const position = executiveNavigation.indexOf(`title: "${title}"`);
    assert.ok(position > previous, `${title} deve permanecer na ordem aprovada`);
    previous = position;
  }
  assert.match(executiveNavigation, /title: "Gestão Arcovan", items: \[\{ to: "\/gestao-arcovan", label: "Dashboard executivo"/);
  assert.doesNotMatch(executiveNavigation, /title: "Visão Geral"/);
  assert.doesNotMatch(executiveNavigation, /title: "Manutenção e Engenharia"|title: "Administração e Cadastros"/);
  assert.match(identity, /overview: \{ label: "Gestão Arcovan"/);
  assert.match(identity, /maintenance: \{ label: "Manutenção"/);
  assert.match(identity, /admin: \{ label: "Administração"/);
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
  assert.match(layout, /onScroll=\{\(event\) => positions\.current\.set\(location\.pathname, event\.currentTarget\.scrollTop\)\}/);
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
