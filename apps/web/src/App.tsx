import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { EpiPage } from "./pages/EpiPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { EquipmentsPage } from "./pages/EquipmentsPage";

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
            <Route path="checklists" element={<ChecklistsPage />} />
            <Route path="epi" element={<EpiPage />} />
            <Route path="manutencao" element={<MaintenancePage />} />
            <Route path="equipamentos" element={<EquipmentsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
