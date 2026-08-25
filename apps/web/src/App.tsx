import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PermissionRoute } from "./components/PermissionRoute";
import { AuthProvider, useAuth, userHasPermission } from "./lib/auth";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { CompanyPage } from "./pages/CompanyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ExecucaoChecklistPage } from "./pages/ExecucaoChecklistPage";
import { HistoricoChecklistPage } from "./pages/HistoricoChecklistPage";
import { EpiPage } from "./pages/EpiPage";
import { EquipmentsPage } from "./pages/EquipmentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { HrCatalogsPrototypePage } from "./pages/hr/HrCatalogsPrototypePage";
import { HrDashboardPrototypePage } from "./pages/hr/HrDashboardPrototypePage";
import { HrEmployeesPrototypePage } from "./pages/hr/HrEmployeesPrototypePage";
import { HrEpiPrototypePage } from "./pages/hr/HrEpiPrototypePage";
import { HrEpiDeliveryRoute } from "./pages/hr/HrEpiDeliveryRoute";
import { HrSchedulePrototypePage } from "./pages/hr/HrSchedulePrototypePage";
import { HrSchedulePage } from "./pages/hr/HrSchedulePage";
import { HrOccurrenceIndicatorsPage } from "./pages/hr/HrOccurrenceIndicatorsPage";
import { SafetyPeoplePage } from "./pages/SafetyPeoplePage";
import { hrFeatures } from "./config/hrFeatures";
import { HrWorkScheduleUnavailablePage } from "./pages/hr/HrModuleUnavailablePage";
import { QuotesPage } from "./pages/QuotesPage";
import { IndustrialPage } from "./pages/IndustrialPage";
import { InventoryPage } from "./pages/InventoryPage";
import { UsersPage } from "./pages/UsersPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { FinancePage } from "./pages/FinancePage";
import { ProcurementWorkflowPage } from "./pages/ProcurementWorkflowPage";
import { FiscalDocumentsPage } from "./pages/FiscalDocumentsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { procurementFeatures } from "./config/procurementFeatures";

function HomeRedirect() {
  const { user } = useAuth();
  const destinations = [
    ["GESTAO_ARCOVAN_VIEW", "/gestao-arcovan"],
    ["OPERATION_CHECKLIST", "/operacao-arcovan/checklists"],
    ["HR_DASHBOARD_VIEW", "/recursos-humanos"],
    ["SAFETY_PEOPLE_VIEW", "/seguranca-pessoas"],
    ["QUOTE_VIEW", "/orcamentos"],
    ["EXPEDITION_VIEW", "/expedicao/fretes"],
    ["MAINTENANCE_VIEW", "/manutencao"],
    ...(procurementFeatures.purchasesEnabled ? [["PURCHASE_VIEW", "/compras"]] as const : []),
    ...(procurementFeatures.accountsPayableEnabled ? [["FINANCIAL_VALUE_VIEW", "/financeiro/contas-a-pagar"]] as const : [])
  ] as const;
  const destination = destinations.find(([permission]) => userHasPermission(user, permission))?.[1] ?? "/acesso-negado";
  return <Navigate to={destination} replace />;
}

function AccessDeniedPage() {
  return <section className="card mx-auto max-w-xl text-center"><h1 className="text-2xl font-extrabold">Acesso negado</h1><p className="mt-2 text-slate-600">Seu perfil não possui permissão para esta funcionalidade.</p></section>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {import.meta.env.DEV && hrFeatures.workScheduleEnabled ? <Route path="/prototype/recursos-humanos/escalas" element={<HrSchedulePrototypePage forceManage />} /> : null}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRedirect />} />
            <Route path="acesso-negado" element={<AccessDeniedPage />} />
            <Route path="gestao-arcovan" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><DashboardPage /></PermissionRoute>} />
            <Route path="gestao-arcovan/historico-checklist" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><HistoricoChecklistPage /></PermissionRoute>} />
            <Route path="gestao-arcovan/downloads" element={<PermissionRoute permission="DOWNLOAD_MANAGE"><DownloadsPage /></PermissionRoute>} />
            <Route path="operacao-arcovan/checklists" element={<PermissionRoute permission="OPERATION_CHECKLIST"><ExecucaoChecklistPage /></PermissionRoute>} />
            <Route path="operacao-arcovan/dds" element={<PermissionRoute permission="OPERATION_DDS"><SafetyPeoplePage /></PermissionRoute>} />
            <Route path="operacao-arcovan/produtos-perdas-qualidade" element={<PermissionRoute permission="OPERATION_QUALITY"><InventoryPage operationalSection="lancamentos" /></PermissionRoute>} />
            <Route path="operacao-arcovan/inventario" element={<PermissionRoute permission="OPERATION_INVENTORY"><InventoryPage operationalSection="inventario" /></PermissionRoute>} />
            <Route path="operacao-arcovan/ordens-manutencao" element={<PermissionRoute permission="OPERATION_MAINTENANCE"><MaintenancePage operational /></PermissionRoute>} />
            <Route path="entrega-epi" element={<PermissionRoute permission="EPI_MANAGE"><Navigate to="/recursos-humanos/epi/ficha-entrega" replace /></PermissionRoute>} />
            <Route path="execucao-checklist" element={<PermissionRoute permission="OPERATION_CHECKLIST"><Navigate to="/operacao-arcovan/checklists" replace /></PermissionRoute>} />
            <Route path="historico-checklist" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><Navigate to="/gestao-arcovan/historico-checklist" replace /></PermissionRoute>} />
            <Route path="downloads" element={<PermissionRoute permission="DOWNLOAD_MANAGE"><Navigate to="/gestao-arcovan/downloads" replace /></PermissionRoute>} />
            <Route path="empresa" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><CompanyPage /></PermissionRoute>} />
            <Route path="funcionarios" element={<PermissionRoute permission="EMPLOYEE_VIEW"><EmployeesPage /></PermissionRoute>} />
            <Route path="epi" element={<PermissionRoute permission="EPI_VIEW"><EpiPage /></PermissionRoute>} />
            <Route path="equipamentos" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><EquipmentsPage /></PermissionRoute>} />
            <Route path="checklists" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><ChecklistsPage /></PermissionRoute>} />
            <Route path="usuarios" element={<PermissionRoute permission="GESTAO_ARCOVAN_VIEW"><UsersPage /></PermissionRoute>} />
            <Route path="manutencao" element={<PermissionRoute permission="MAINTENANCE_VIEW"><MaintenancePage /></PermissionRoute>} />
            {procurementFeatures.purchasesEnabled ? <Route path="compras" element={<PermissionRoute permission="PURCHASE_VIEW"><PurchasesPage /></PermissionRoute>} /> : null}
            {procurementFeatures.purchasesEnabled ? <Route path="compras/cotacoes" element={<PermissionRoute permission="PURCHASE_VIEW"><ProcurementWorkflowPage section="quotes" /></PermissionRoute>} /> : null}
            {procurementFeatures.purchaseApprovalsEnabled ? <Route path="compras/aprovacoes" element={<PermissionRoute permission="PURCHASE_APPROVE"><ProcurementWorkflowPage section="approvals" /></PermissionRoute>} /> : null}
            {procurementFeatures.purchasesEnabled ? <Route path="compras/ordens" element={<PermissionRoute permission="PURCHASE_VIEW"><ProcurementWorkflowPage section="orders" /></PermissionRoute>} /> : null}
            {procurementFeatures.goodsReceiptsEnabled ? <Route path="compras/recebimentos" element={<PermissionRoute permission="PURCHASE_VIEW"><ProcurementWorkflowPage section="receipts" /></PermissionRoute>} /> : null}
            {procurementFeatures.accountsPayableEnabled ? <Route path="financeiro/contas-a-pagar" element={<PermissionRoute permission="FINANCIAL_VALUE_VIEW"><FinancePage /></PermissionRoute>} /> : null}
            {procurementFeatures.fiscalDocumentsEnabled ? <Route path="financeiro/entrada-notas" element={<PermissionRoute permission="FISCAL_DOCUMENT_IMPORT"><FiscalDocumentsPage /></PermissionRoute>} /> : null}
            {procurementFeatures.paymentsEnabled ? <Route path="financeiro/pagamentos" element={<PermissionRoute permission="FINANCIAL_VALUE_VIEW"><PaymentsPage /></PermissionRoute>} /> : null}
            <Route path="orcamentos" element={<PermissionRoute permission="QUOTE_VIEW"><QuotesPage /></PermissionRoute>} />
            <Route path="forca-vendas/pedidos" element={<PermissionRoute permission="SALES_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="forca-vendas/crm" element={<PermissionRoute permission="CRM_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="forca-vendas/relacao" element={<PermissionRoute permission="SALES_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="expedicao/fretes" element={<PermissionRoute permission="EXPEDITION_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="estoque" element={<PermissionRoute permission="INDUSTRIAL_STOCK_VIEW"><InventoryPage /></PermissionRoute>} />
            <Route path="estoque/:section" element={<PermissionRoute permission="INDUSTRIAL_STOCK_VIEW"><InventoryPage /></PermissionRoute>} />
            <Route path="producao/controle" element={<PermissionRoute permission="PRODUCTION_VIEW"><Navigate to="/estoque/lancamentos" replace /></PermissionRoute>} />
            <Route path="financeiro/vendas" element={<PermissionRoute permission="FINANCE_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="financeiro/fretes" element={<PermissionRoute permission="FINANCE_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="financeiro/diesel" element={<PermissionRoute permission="FINANCE_VIEW"><IndustrialPage /></PermissionRoute>} />
            <Route path="recursos-humanos" element={<PermissionRoute permission="HR_DASHBOARD_VIEW"><HrDashboardPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/indicadores-ocorrencias" element={<PermissionRoute permission="OCCURRENCE_VIEW"><HrOccurrenceIndicatorsPage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi" element={<PermissionRoute permission="EPI_VIEW"><HrEpiPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/ficha-entrega" element={<PermissionRoute permission="EPI_MANAGE"><HrEpiDeliveryRoute /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/movimentacoes" element={<PermissionRoute permission="EPI_VIEW"><Navigate to="/recursos-humanos/epi#movimentacoes" replace /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/historico" element={<PermissionRoute permission="EPI_VIEW"><Navigate to="/recursos-humanos/epi#historico" replace /></PermissionRoute>} />
            <Route path="recursos-humanos/funcionarios" element={<PermissionRoute permission="EMPLOYEE_VIEW"><HrEmployeesPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/escalas" element={hrFeatures.workScheduleEnabled ? <PermissionRoute permission="SCHEDULE_VIEW"><HrSchedulePage /></PermissionRoute> : <HrWorkScheduleUnavailablePage />} />
            <Route path="recursos-humanos/cadastros" element={<PermissionRoute permission="DEPARTMENT_VIEW"><HrCatalogsPrototypePage /></PermissionRoute>} />
            <Route path="seguranca-pessoas" element={<PermissionRoute permission="SAFETY_PEOPLE_VIEW"><SafetyPeoplePage /></PermissionRoute>} />
            <Route path="seguranca-pessoas/realizar" element={<PermissionRoute permission="SAFETY_PEOPLE_EXECUTE"><SafetyPeoplePage /></PermissionRoute>} />
            <Route path="seguranca-pessoas/historico" element={<PermissionRoute permission="SAFETY_PEOPLE_VIEW"><SafetyPeoplePage /></PermissionRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
