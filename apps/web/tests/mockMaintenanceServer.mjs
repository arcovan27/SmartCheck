import http from "node:http";

const now = new Date();
const equipment = [
  { id: "eq1", name: "Prensa de Tubos 01", type: "MAQUINA", assetTag: "PAT-001", serialNumber: "PT01", department: "Produção", manufacturer: "Arcovan", model: "PT-500", isActive: true },
  { id: "eq2", name: "Misturador Central", type: "MAQUINA", assetTag: "PAT-014", serialNumber: "MC14", department: "Mistura", isActive: true },
  { id: "eq3", name: "Empilhadeira 02", type: "VEICULO", assetTag: "PAT-028", serialNumber: "EMP02", department: "Expedição", isActive: true },
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `eq-extra-${index + 1}`,
    name: `Equipamento de teste ${String(index + 1).padStart(2, "0")}`,
    assetTag: `PAT-${String(index + 101).padStart(3, "0")}`,
    department: "Manutenção",
    isActive: true
  }))
];
const employees = [
  { id: "emp1", name: "MARCOS MATHIAS DOS SANTOS", department: "Manutenção", position: "Mecânico" },
  { id: "emp2", name: "Micael", department: "Manutenção", position: "Eletricista" },
  ...Array.from({ length: 18 }, (_, index) => ({ id: `emp-extra-${index + 1}`, name: `Responsável de teste ${String(index + 1).padStart(2, "0")}`, department: "Manutenção", position: "Técnico" }))
];
const suppliers = [
  { id: "sup1", name: "TecnoService", document: "12.345.678/0001-90", contactName: "Carlos", phone: "(11) 99999-0000" },
  ...Array.from({ length: 19 }, (_, index) => ({ id: `sup-extra-${index + 1}`, name: `Empresa terceirizada ${String(index + 1).padStart(2, "0")}` }))
];
const ddsTitles = ["DDS - CAUAN", "DDS - FERNANDO", "DDS - RODRIGO", "DDS - RONALDO"];
const ddsItems = ddsTitles.map((title, index) => ({
  id: `dds-execution-${index + 1}`,
  title,
  topic: "Diálogo Diário de Segurança",
  executedAt: new Date(now.getTime() - index * 86400000).toISOString(),
  registeredAt: new Date(now.getTime() - index * 86400000).toISOString(),
  responsible: { id: `dds-employee-${index + 1}`, name: title.replace("DDS - ", "") },
  participants: [{ id: employees[index % employees.length].id, name: employees[index % employees.length].name, department: index === 2 ? "EXPEDIÇÃO" : "PRODUÇÃO", confirmed: true }],
  departments: [index === 2 ? "EXPEDIÇÃO" : "PRODUÇÃO"],
  notes: null,
  hadProblem: false,
  responseCount: 9,
  attachmentCount: 0,
  launchedBy: { id: `dds-user-${index + 1}`, email: `${title.replace("DDS - ", "").toLowerCase()}@smartcheck.local` }
}));
const base = (id, number, equipmentIndex, status, priority, type, description, days, extra = {}) => ({ id, number, equipmentId: equipment[equipmentIndex].id, equipment: equipment[equipmentIndex], status, priority, type, description, kanbanPosition: number, lockVersion: 0, openedAt: new Date(now.getTime() - days * 86400000).toISOString(), expectedAt: new Date(now.getTime() + (days - 2) * 86400000).toISOString(), executionType: "INTERNA", requestedById: "user1", requesterNameSnapshot: "Operador Arcovan", requesterDepartmentSnapshot: "Produção", equipmentLocationSnapshot: equipment[equipmentIndex].department, assignees: status === "ABERTA" ? [] : [{ employeeId: employees[number % 2].id, employee: employees[number % 2] }], attachments: number % 2 ? [{ id: `att${number}`, filename: "foto.jpg", mimeType: "image/jpeg", path: "uploads/foto.jpg" }] : [], pendencies: [], materials: [], responsible: null, supplier: null, plan: null, ...extra });
const orders = [
  base("ord1", 124, 0, "ABERTA", "CRITICA", "EMERGENCIAL", "[Checklist] Vazamento hidráulico", 3, { checklistExecutionId: "check1", cause: "Óleo identificado abaixo do cilindro", notes: "Aguardando triagem", checklistExecution: { id: "check1", executedAt: new Date(now.getTime() - 3 * 86400000).toISOString(), template: { name: "Checklist diário da prensa" }, employee: { name: "Operador Arcovan" }, items: [{ id: "check-item-1", hadProblem: true, observation: "Óleo identificado abaixo do cilindro", templateItem: { label: "Sistema hidráulico sem vazamentos" }, attachments: [{ id: "check-photo-1", filename: "vazamento-checklist.jpg", mimeType: "image/jpeg", path: "uploads/foto.jpg" }] }] } }),
  base("ord2", 123, 1, "PLANEJADA", "NORMAL", "PREVENTIVA", "Revisão mensal de correias e lubrificação", 1),
  base("ord3", 122, 2, "EM_ANDAMENTO", "ALTA", "EMERGENCIAL", "Falha intermitente no sistema hidráulico", 1),
  base("ord4", 121, 0, "PENDENTE", "NORMAL", "PREVENTIVA", "Troca programada do rolamento", 4, { pendencies: [{ id: "pending-1", reason: "AGUARDANDO_PECA_MATERIAL", description: "Rolamento ainda não recebido", startedAt: new Date(now.getTime() - 86400000).toISOString(), endedAt: null, actorUser: { employee: { name: "Gestor de Manutenção" } } }] }),
  base("ord5", 120, 1, "CONCLUIDA", "BAIXA", "PREVENTIVA", "Inspeção e reaperto dos componentes", 8, { concludedAt: new Date(now.getTime() - 5 * 86400000).toISOString(), servicePerformed: "Inspeção concluída" }),
  base("ord6", 119, 2, "PLANEJADA", "ALTA", "CORRETIVA", "Substituição do conjunto de freio", 2, { executionType: "TERCEIRIZADA", supplier: { id: "sup1", name: "TecnoService", document: "12.345.678/0001-90" }, supplierId: "sup1" })
];
const createdOrders = [];
let nextNumber = 125;

function send(response, data, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" }); response.end(JSON.stringify(data)); }
const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") return send(response, {});
  const url = new URL(request.url, "http://localhost:3333");
  if (url.pathname === "/auth/login") return send(response, { token: "visual-token", user: { id: "user1", email: "admin@smartcheck.local", role: "ADMIN", isActive: true, permissions: ["*"], employee: { id: "admin", name: "Gestor de Manutenção" } } });
  if (url.pathname === "/files/foto.jpg") { const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"); response.writeHead(200, { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*" }); return response.end(image); }
  if (url.pathname === "/auth/me") return send(response, { id: "user1", email: "admin@smartcheck.local", role: "ADMIN", isActive: true, permissions: ["*"], employee: { id: "admin", name: "Gestor de Manutenção" } });
  if (url.pathname === "/company") return send(response, { tradeName: "Arcovan" });
  if (url.pathname === "/maintenance/meta") return send(response, { equipments: [...equipment].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), maintenanceEmployees: [...employees].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), requesters: [], suppliers: [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), materials: [], currentEmployeeId: "emp1", permissions: { manage: true, updateInternal: true, viewDashboard: true, viewCosts: true, reopen: true, managePlans: true, export: true } });
  if (url.pathname === "/safety-people/dds/meta") return send(response, { templates: ddsTitles.map((name, index) => ({ id: `dds-template-${index + 1}`, name, description: "Diálogo Diário de Segurança", periodicity: "DIARIO", isActive: true, _count: { executions: [31, 38, 24, 43][index] }, items: Array.from({ length: 9 }, (_, itemIndex) => ({ id: `template-${index + 1}-item-${itemIndex + 1}`, label: `Pergunta de segurança ${itemIndex + 1}`, section: "Segurança", itemType: "OK_PROBLEMA_NA", required: true, allowsPhotoOnProblem: true, requiresPhotoOnProblem: false })) })), employees: employees.map((employee) => ({ ...employee, hasActiveUser: true })), currentEmployeeId: "emp1", permissions: { view: true, execute: true, manage: true } });
  if (url.pathname === "/safety-people/dds" && request.method === "GET") return send(response, { page: 1, pageSize: 20, total: 136, totalPages: 7, items: ddsItems });
  if (url.pathname.startsWith("/safety-people/dds/") && !url.pathname.includes("/templates/")) {
    const item = ddsItems.find((entry) => entry.id === url.pathname.split("/").at(-1)) ?? ddsItems[0];
    return send(response, { ...item, template: { name: item.title, description: item.topic }, employee: { name: item.responsible.name }, departmentNameSnapshot: item.departments[0], createdAt: item.registeredAt, items: Array.from({ length: 9 }, (_, index) => ({ id: `answer-${index + 1}`, optionResult: "OK", booleanResult: null, numericValue: null, textValue: null, observation: null, templateItem: { label: `Pergunta de segurança ${index + 1}` }, attachments: [] })), signatures: [], history: [{ action: "DDS_REGISTERED", at: item.registeredAt, employee: item.responsible.name, user: item.launchedBy.email }], launchedBy: item.launchedBy });
  }
  if (url.pathname === "/checklist-executions" && request.method === "POST") {
    let body = ""; request.on("data", (chunk) => { body += chunk; }); return request.on("end", () => send(response, { id: "dds-created-mobile", ...JSON.parse(body), createdAt: new Date().toISOString() }, 201));
  }
  if (url.pathname === "/hr/dds") return send(response, { page: 1, pageSize: 20, total: 136, totalPages: 7, templates: ddsTitles.map((name, index) => ({ id: `dds-template-${index + 1}`, name, description: "Diálogo Diário de Segurança", isActive: true, _count: { executions: [31, 38, 24, 43][index], items: 9 } })), items: ddsItems });
  if (url.pathname.startsWith("/hr/dds/")) {
    const item = ddsItems.find((entry) => entry.id === url.pathname.split("/").at(-1)) ?? ddsItems[0];
    return send(response, { ...item, template: { name: item.title, description: item.topic }, employee: { name: item.responsible.name }, departmentNameSnapshot: item.department, operatorName: item.responsible.name, secondaryOperatorName: null, createdAt: item.registeredAt, items: Array.from({ length: 9 }, (_, index) => ({ id: `answer-${index + 1}`, optionResult: index === 0 ? "OK" : null, booleanResult: index === 0 ? null : true, numericValue: null, textValue: null, observation: null, templateItem: { label: `Pergunta de segurança ${index + 1}` }, attachments: [] })), signatures: [], history: [{ action: "DDS_REGISTERED", at: item.registeredAt, employee: item.responsible.name, user: item.launchedBy.email }], launchedBy: item.launchedBy, participants: item.participants });
  }
  if (url.pathname === "/maintenances/dashboard") return send(response, { cards: { open: 2, pending: 1, inProgress: 1, concluded: 1, overdue: 2, preventiveDue: 3 }, charts: { byType: [{ label: "EMERGENCIAL", value: 2 }, { label: "PREVENTIVA", value: 3 }], byPriority: [{ label: "CRITICA", value: 1 }, { label: "ALTA", value: 2 }, { label: "NORMAL", value: 2 }] }, averages: { startHours: 2.4, completionHours: 14.8 }, totalCost: 4850.75, execution: { internal: { total: 5, open: 2, pending: 1, inProgress: 1, concluded: 1, cost: 1850.75, averageCompletionHours: 12.5 }, outsourced: { total: 1, open: 1, pending: 0, inProgress: 0, concluded: 0, cost: 3000, averageCompletionHours: 0 } } });
  if (url.pathname === "/maintenances" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    return request.on("end", () => {
      const payload = JSON.parse(body);
      const created = { id: `created-${nextNumber}`, number: nextNumber++, ...payload };
      createdOrders.push(created);
      send(response, created, 201);
    });
  }
  if (url.pathname === "/test/created") return send(response, createdOrders);
  if (url.pathname.startsWith("/history/equipment/")) {
    const equipmentId = url.pathname.split("/").at(-1);
    const selectedEquipment = equipment.find((item) => item.id === equipmentId) ?? equipment[0];
    const selectedOrders = orders.filter((item) => item.equipmentId === selectedEquipment.id);
    return send(response, { company: { legalName: "Arcovan Indústria", tradeName: "Arcovan", cnpj: "00.000.000/0001-00" }, equipment: selectedEquipment, filters: {}, checklists: [], maintenances: selectedOrders, plans: [], planAlerts: [], emittedAt: new Date().toISOString() });
  }
  if (url.pathname === "/maintenances") return send(response, orders);
  if (/^\/maintenances\/[^/]+\/move$/.test(url.pathname) && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    return request.on("end", () => {
      const payload = JSON.parse(body);
      const order = orders.find((item) => item.id === url.pathname.split("/")[2]);
      if (!order) return send(response, { message: "Ordem não encontrada" }, 404);
      if (payload.expectedVersion !== order.lockVersion) return send(response, { message: "Esta ordem foi alterada por outro usuário." }, 409);
      order.status = payload.targetStatus;
      order.kanbanPosition = payload.targetPosition;
      order.lockVersion += 1;
      if (payload.pending) order.pendencies = [{ id: `pending-${Date.now()}`, ...payload.pending, startedAt: new Date().toISOString(), actorUser: { employee: { name: "Gestor de Manutenção" } } }, ...order.pendencies];
      return send(response, order);
    });
  }
  if (url.pathname.startsWith("/maintenances/")) { const order = orders.find((item) => item.id === url.pathname.split("/")[2]) ?? orders[0]; return send(response, { ...order, history: [{ id: "h1", action: order.checklistExecutionId ? "CREATED_FROM_CHECKLIST" : "CREATED", createdAt: order.openedAt, actorUser: { email: "operador@smartcheck.local", employee: { name: "Operador Arcovan" } }, details: order.checklistExecutionId ? { origin: "CHECKLIST" } : {} }] }); }
  if (url.pathname === "/maintenance-plans") return send(response, [{ id: "plan1", title: "Revisão mensal da prensa", equipment: equipment[0], frequency: "MENSAL", nextExecutionAt: new Date(now.getTime() + 4 * 86400000).toISOString(), isActive: true, generatedOrders: [] }]);
  return send(response, { message: "Not found" }, 404);
});
server.listen(3333, "127.0.0.1", () => process.stdout.write("mock-maintenance-ready\n"));
