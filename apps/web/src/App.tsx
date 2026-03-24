import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/auth";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { CompanyPage } from "./pages/CompanyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { EntregaEpiPage } from "./pages/EntregaEpiPage";
import { ExecucaoChecklistPage } from "./pages/ExecucaoChecklistPage";
import { EpiPage } from "./pages/EpiPage";
import { EquipmentsPage } from "./pages/EquipmentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MaintenancePage } from "./pages/MaintenancePage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="entrega-epi" element={<EntregaEpiPage />} />
            <Route path="execucao-checklist" element={<ExecucaoChecklistPage />} />
            <Route path="empresa" element={<CompanyPage />} />
            <Route path="funcionarios" element={<EmployeesPage />} />
            <Route path="epi" element={<EpiPage />} />
            <Route path="equipamentos" element={<EquipmentsPage />} />
            <Route path="checklists" element={<ChecklistsPage />} />
            <Route path="manutencao" element={<MaintenancePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
