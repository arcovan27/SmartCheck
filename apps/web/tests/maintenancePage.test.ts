import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/MaintenancePage.tsx", "utf8");
const app = readFileSync("apps/web/src/App.tsx", "utf8");
const layout = readFileSync("apps/web/src/components/AppLayout.tsx", "utf8");
const searchableSelect = readFileSync(
  "apps/web/src/components/SearchableSelect.tsx",
  "utf8",
);
const kanban = readFileSync("apps/web/src/components/MaintenanceKanban.tsx", "utf8");
const openingArea = page.slice(
  page.indexOf('area === "orders"'),
  page.indexOf('area === "history"'),
);

test("manutencao permanece em um unico menu e possui as seis areas internas", () => {
  assert.equal((layout.match(/to: "\/manutencao"/g) ?? []).length, 1);
  for (const area of [
    "Dashboard",
    "Ordens de Manutenção",
    "Manutenções Preventivas",
    "Equipamentos",
    "Empresas Terceirizadas",
    "Histórico",
  ])
    assert.match(page, new RegExp(area));
});

test("abertura exige selecao exclusiva do tipo de atendimento", () => {
  assert.match(openingArea, /Selecione o equipamento/);
  assert.doesNotMatch(page, />Máquina ou equipamento</);
  assert.equal((page.match(/name="executionType"/g) ?? []).length, 2);
  assert.match(
    page,
    /required\s+type="radio"\s+name="executionType"\s+value="INTERNA"/,
  );
  assert.match(
    page,
    /required\s+type="radio"\s+name="executionType"\s+value="TERCEIRIZADA"/,
  );
  assert.match(page, /executionType: quick\.executionType/);
});

test("dashboard e consulta operacional permanecem fora da abertura", () => {
  assert.match(page, /Filtros do Dashboard/);
  assert.match(page, /execution\?\.internal/);
  assert.match(page, /execution\?\.outsourced/);
  assert.match(page, /dashboardFilters/);
  assert.match(page, /Consulta e movimentação das ordens/);
  assert.match(page, /Todas as empresas terceirizadas/);
  assert.match(page, /setArea\("history"\)/);
});

test("aba de ordens exibe somente a abertura rapida", () => {
  assert.match(openingArea, /Abertura rápida/);
  assert.match(openingArea, /Abrir ordem de manutenção/);
  assert.doesNotMatch(openingArea, /Consulta e movimentação das ordens/);
  assert.doesNotMatch(
    openingArea,
    /Exportar CSV|Kanban|Nº, equipamento ou descrição/,
  );
  assert.doesNotMatch(
    openingArea,
    /Nova ordem de manutenção|Fechar formulário/,
  );
});

test("equipamento usa um unico seletor pesquisavel integrado", () => {
  assert.match(openingArea, /<SearchableSelect/);
  assert.match(openingArea, /id="maintenance-equipment-selector"/);
  assert.match(openingArea, /placeholder="Selecione o equipamento"/);
  assert.match(page, /label: equipment\.name/);
  assert.doesNotMatch(
    page.slice(page.indexOf("const equipmentOptions"), page.indexOf("const orders")),
    /assetTag|serialNumber|department|location/,
  );
  assert.match(searchableSelect, /createPortal/);
  assert.match(searchableSelect, /overflow-y-auto/);
  assert.match(searchableSelect, /touch-pan-y/);
  assert.match(searchableSelect, /100dvh/);
  assert.doesNotMatch(
    page,
    /Buscar por nome, código, patrimônio, setor ou local/,
  );
});

test("responsaveis sao dinamicos e selecao terceirizada limpa funcionario", () => {
  assert.ok((page.match(/meta\.maintenanceEmployees\.map/g) ?? []).length >= 5);
  assert.match(openingArea, /Distribuir posteriormente/);
  assert.match(openingArea, /responsibleId: ""/);
  assert.doesNotMatch(page, /Marcos Mathias dos Santos/i);
  assert.doesNotMatch(page, /Micael da Silva Prestes/i);
});

test("identificacao interna ou terceirizada aparece nas visoes operacionais", () => {
  assert.match(page, /executionLabel\(order\.executionType\)/);
  assert.match(page, /badge-neutral/);
  assert.match(page, /Responsável \/ empresa/);
});

test("abertura mobile usa poucos campos e confirma o numero da ordem", () => {
  assert.match(page, /Abertura rápida/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /requesterDepartmentSnapshot|preenchidos automaticamente/);
  assert.match(page, /Solicitação aberta com sucesso/);
  assert.match(page, /OS-\$\{String\(order\.number\)/);
});

test("kanban e fallback mobile compartilham os cinco status e regras obrigatorias", () => {
  for (const status of [
    "ABERTA",
    "PLANEJADA",
    "EM_ANDAMENTO",
    "PENDENTE",
    "CONCLUIDA",
  ])
    assert.match(page, new RegExp(status));
  assert.match(page, /<MaintenanceKanban/);
  assert.match(kanban, /pointerType === "touch" \? 10 : 6/);
  assert.match(kanban, /data-kanban-placeholder/);
  assert.match(kanban, /autoScroll/);
  assert.match(kanban, /cursor-grab/);
  assert.match(page, /Descreva o serviço executado para concluir/);
  assert.match(page, /Motivo da pendência/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="pending-dialog-title"/);
  assert.match(page, /setPendingTransition\(\{ order, reason: "", description: "", targetPosition \}\)/);
  assert.match(page, /Cancelar/);
});

test("kanban oferece mover para, feedback, rollback e atualizacao local", () => {
  assert.match(page, /Mover para/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /A ordem voltou à posição anterior/);
  assert.match(page, /queryClient\.setQueryData/);
  assert.match(page, /Limpar filtros/);
  assert.doesNotMatch(kanban, /draggable=|onDragStart|onDrop=/);
});

test("kanban responsivo mantem colunas rolaveis e respeita reducao de movimento", () => {
  assert.match(kanban, /w-\[min\(85vw,19rem\)\]/);
  assert.match(kanban, /overflow-x-auto/);
  assert.match(kanban, /motion-reduce/);
  assert.match(kanban, /touch-pan-y/);
  assert.match(kanban, /aria-label="Quadro Kanban/);
});

test("execucao permite assumir ordem e anexar evidencias sem expor controles ao colaborador", () => {
  assert.match(page, /Assumir ordem/);
  assert.match(page, /Fotos e anexos adicionais/);
  assert.match(page, /attachmentIds/);
  assert.match(page, /canUpdate &&/);
  assert.match(page, /meta\.permissions\.updateInternal/);
});

test("rota e menu exigem permissao de manutencao", () => {
  assert.match(app, /permission="MAINTENANCE_VIEW"/);
  assert.match(layout, /permission: "MAINTENANCE_VIEW"/);
});

test("equipamento abre historico exclusivo, filtravel e imprimivel", () => {
  assert.match(page, /function EquipmentDetails/);
  assert.match(page, /\/history\/equipment\/\$\{equipment\.id\}/);
  assert.match(page, /Histórico completo/);
  assert.match(page, /Data específica/);
  assert.match(page, /Período consultado/);
  assert.match(page, /Imprimir relatório/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /maintenance-print-report/);
  assert.match(page, /setSelectedEquipment\(equipment\)/);
});

test("detalhamento mostra origem, pendencias e galeria ampliada", () => {
  assert.match(page, /Origem: checklist/);
  assert.match(page, /order\.checklistExecution\.employee/);
  assert.match(page, /order\.pendencies\.map/);
  assert.match(page, /function AttachmentGallery/);
  assert.match(page, /Visualização ampliada do anexo/);
  assert.match(page, /Foto anterior/);
  assert.match(page, /Próxima foto/);
  assert.match(page, /Nenhuma foto anexada/);
  assert.match(page, /Origem: \{attachment\.origin\}/);
  assert.match(page, /Quem preencheu o checklist/);
  assert.match(page, /Quem abriu a ordem/);
  assert.match(page, /Descrição original do defeito ou irregularidade/);
  assert.match(page, /Descrição complementar do problema/);
});

test("triagem preserva irregularidade e limpa destino incompatível", () => {
  assert.match(page, /Observação complementar/);
  assert.match(page, /priority: form\.priority/);
  assert.match(page, /form\.executionType === "TERCEIRIZADA"/);
  assert.match(page, /form\.executionType === "INTERNA" \? form\.assigneeIds : \[\]/);
  assert.match(page, /Complementa a solicitação sem alterar a irregularidade original/);
});

test("kpis de tempo medio e custos ficam desabilitados por configuracao", () => {
  assert.match(page, /showAverageServiceTimeKpi: false/);
  assert.match(page, /showCostKpi: false/);
  assert.match(page, /maintenanceFeatures\.showAverageServiceTimeKpi/);
  assert.match(page, /maintenanceFeatures\.showCostKpi/);
});

test("pendencia exige texto, identifica ordem e preserva cancelamento", () => {
  assert.match(page, /Registrar motivo da pendência/);
  assert.match(page, /pendingTransition\.order\.equipment\.name/);
  assert.match(page, /Status anterior/);
  assert.match(page, /pendingTransition\.description\.trim\(\)\.length < 3/);
  assert.match(page, /setPendingTransition\(null\)/);
});

test("pendencia recente aparece no card, lista e exportacao", () => {
  assert.match(page, /Pendência registrada/);
  assert.match(page, /Motivo da pendência/);
  assert.match(page, /Motivo mais recente da pendência/);
  assert.match(page, /Histórico de movimentações/);
  assert.match(page, /order\.pendencies\?\.\[0\]/);
});
