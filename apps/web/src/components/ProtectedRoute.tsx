import { Navigate, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import { useAuth } from "../lib/auth";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.checklistOnly && location.pathname !== "/execucao-checklist") {
    return <Navigate to="/execucao-checklist" replace />;
  }

  return children;
}
