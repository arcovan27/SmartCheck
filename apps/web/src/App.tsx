import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PermissionRoute } from "./components/PermissionRoute";
import { AuthProvider } from "./lib/auth";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { CompanyPage } from "./pages/CompanyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { EntregaEpiPage } from "./pages/EntregaEpiPage";
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
import { HrEpiHistoryPage } from "./pages/hr/HrEpiHistoryPage";
import { HrSchedulePrototypePage } from "./pages/hr/HrSchedulePrototypePage";
import { HrSchedulePage } from "./pages/hr/HrSchedulePage";
import { HrOccurrenceIndicatorsPage } from "./pages/hr/HrOccurrenceIndicatorsPage";
import { hrFeatures } from "./config/hrFeatures";
import { HrWorkScheduleUnavailablePage } from "./pages/hr/HrModuleUnavailablePage";

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
            <Route index element={<DashboardPage />} />
            <Route path="entrega-epi" element={<PermissionRoute permission="EPI_MANAGE"><Navigate to="/recursos-humanos/epi/ficha-entrega" replace /></PermissionRoute>} />
            <Route path="execucao-checklist" element={<ExecucaoChecklistPage />} />
            <Route path="historico-checklist" element={<HistoricoChecklistPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="empresa" element={<CompanyPage />} />
            <Route path="funcionarios" element={<PermissionRoute permission="EMPLOYEE_VIEW"><EmployeesPage /></PermissionRoute>} />
            <Route path="epi" element={<PermissionRoute permission="EPI_VIEW"><EpiPage /></PermissionRoute>} />
            <Route path="equipamentos" element={<EquipmentsPage />} />
            <Route path="checklists" element={<ChecklistsPage />} />
            <Route path="manutencao" element={<MaintenancePage />} />
            <Route path="recursos-humanos" element={<PermissionRoute permission="HR_DASHBOARD_VIEW"><HrDashboardPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/indicadores-ocorrencias" element={<PermissionRoute permission="OCCURRENCE_VIEW"><HrOccurrenceIndicatorsPage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi" element={<PermissionRoute permission="EPI_VIEW"><HrEpiPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/ficha-entrega" element={<PermissionRoute permission="EPI_MANAGE"><EntregaEpiPage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/movimentacoes" element={<PermissionRoute permission="EPI_VIEW"><HrEpiPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/epi/historico" element={<PermissionRoute permission="EPI_VIEW"><HrEpiHistoryPage /></PermissionRoute>} />
            <Route path="recursos-humanos/funcionarios" element={<PermissionRoute permission="EMPLOYEE_VIEW"><HrEmployeesPrototypePage /></PermissionRoute>} />
            <Route path="recursos-humanos/escalas" element={hrFeatures.workScheduleEnabled ? <PermissionRoute permission="SCHEDULE_VIEW"><HrSchedulePage /></PermissionRoute> : <HrWorkScheduleUnavailablePage />} />
            <Route path="recursos-humanos/cadastros" element={<PermissionRoute permission="DEPARTMENT_VIEW"><HrCatalogsPrototypePage /></PermissionRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
