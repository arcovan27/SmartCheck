import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("Gestão Arcovan contém somente dashboard, histórico e downloads", async () => {
  const layout = await read("components/AppLayout.tsx");
  const management = layout.slice(layout.indexOf("const dashboardMenu"), layout.indexOf("const operationMenu"));
  assert.match(management, /gestao-arcovan.*Dashboard/s);
  assert.match(management, /gestao-arcovan\/historico-checklist/);
  assert.match(management, /gestao-arcovan\/downloads/);
  assert.doesNotMatch(management, /Execução de checklist/);
});

test("Operação Arcovan expõe as cinco entradas com permissões independentes", async () => {
  const layout = await read("components/AppLayout.tsx");
  for (const permission of ["OPERATION_CHECKLIST", "OPERATION_DDS", "OPERATION_QUALITY", "OPERATION_INVENTORY", "OPERATION_MAINTENANCE"]) {
    assert.match(layout, new RegExp(permission));
  }
  const app = await read("App.tsx");
  assert.match(app, /operacao-arcovan\/dds.*OPERATION_DDS/s);
  assert.match(app, /operacao-arcovan\/inventario.*OPERATION_INVENTORY/s);
  assert.match(app, /operacao-arcovan\/produtos-perdas-qualidade.*OPERATION_QUALITY/s);
  assert.match(app, /operacao-arcovan\/ordens-manutencao.*OPERATION_MAINTENANCE/s);
});

test("páginas operacionais ocultam navegações administrativas", async () => {
  const dds = await read("pages/SafetyPeoplePage.tsx");
  const inventory = await read("pages/InventoryPage.tsx");
  const maintenance = await read("pages/MaintenancePage.tsx");
  assert.match(dds, /!operational \? <nav/);
  assert.match(inventory, /!operationalSection \? <nav/);
  assert.match(maintenance, /!operational \? <nav/);
});

test("downloads usam fetch autenticado e não links estáticos públicos", async () => {
  const page = await read("pages/DownloadsPage.tsx");
  const api = await read("lib/api.ts");
  assert.match(page, /downloadProtectedFile/);
  assert.doesNotMatch(page, /href=.*downloads/);
  assert.match(api, /fetch\(getApiUrl\(`\/downloads\/\$\{path\}`\)/);
  assert.match(api, /Authorization: `Bearer \$\{token\}`/);
});

test("rotas negadas não retornam silenciosamente ao dashboard", async () => {
  const route = await read("components/PermissionRoute.tsx");
  assert.match(route, /Navigate to="\/acesso-negado"/);
});

test("cliente diferencia indisponibilidade da API de rejeição de credenciais", async () => {
  const api = await read("lib/api.ts");
  assert.match(api, /Não foi possível conectar ao servidor\. Tente novamente\./);
  assert.match(api, /E-mail ou senha inválidos\./);
  assert.match(api, /Usuário sem permissão de acesso\./);
  assert.doesNotMatch(api, /throw new Error\("Failed to fetch"\)/);
});
