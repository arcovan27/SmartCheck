import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";

export type UserRole =
  | "ADMIN"
  | "MANUTENCAO"
  | "OPERADOR"
  | "SEGURANCA_DO_TRABALHO"
  | "ALMOXARIFADO";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  checklistOnly?: boolean;
  permissions?: string[];
  employee?: {
    id: string;
    name: string;
  } | null;
};

const fallbackPermissions: Partial<Record<UserRole, string[]>> = {
  ADMIN: ["*"],
  SEGURANCA_DO_TRABALHO: ["HR_ACCESS", "HR_DASHBOARD_VIEW", "EPI_VIEW", "EPI_COST_VIEW", "EPI_MANAGE", "EMPLOYEE_VIEW", "EMPLOYEE_MANAGE", "SCHEDULE_VIEW", "SCHEDULE_MANAGE", "OCCURRENCE_REGISTER", "OCCURRENCE_REVIEW", "OCCURRENCE_VIEW", "OCCURRENCE_EDIT", "OCCURRENCE_CANCEL", "WARNING_VIEW", "WARNING_REGISTER", "SUSPENSION_VIEW", "SUSPENSION_REGISTER", "WORK_ACCIDENT_VIEW", "WORK_ACCIDENT_REGISTER", "DOCUMENT_VIEW", "REPORT_EXPORT", "CATALOG_MANAGE", "DEPARTMENT_VIEW", "DEPARTMENT_CREATE", "DEPARTMENT_EDIT", "DEPARTMENT_DEACTIVATE", "DEPARTMENT_DELETE"],
  ALMOXARIFADO: ["HR_ACCESS", "EPI_VIEW", "EPI_MANAGE", "EMPLOYEE_VIEW", "REPORT_EXPORT"],
  MANUTENCAO: ["HR_ACCESS", "EMPLOYEE_VIEW", "SCHEDULE_VIEW"],
  OPERADOR: []
};

export function userHasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user || user.checklistOnly) return false;
  const permissions = user.permissions ?? fallbackPermissions[user.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithChecklistToken: (token: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("smartcheck.token");
    if (!token) {
      setLoading(false);
      return;
    }

    apiRequest<AuthUser>("/auth/me")
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem("smartcheck.token");
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem("smartcheck.token", result.token);
    setUser(result.user);
  }

  async function loginWithChecklistToken(token: string) {
    const result = await apiRequest<{ token: string; user: AuthUser }>("/auth/checklist-link-login", {
      method: "POST",
      body: JSON.stringify({ token })
    });

    localStorage.setItem("smartcheck.token", result.token);
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem("smartcheck.token");
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, loginWithChecklistToken, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider");
  }

  return context;
}
