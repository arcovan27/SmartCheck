import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";

export type UserRole =
  | "ADMIN"
  | "ENCARREGADO"
  | "MANUTENCAO"
  | "OPERADOR"
  | "RECURSOS_HUMANOS"
  | "SEGURANCA_DO_TRABALHO"
  | "VENDEDOR"
  | "EXPEDICAO"
  | "ALMOXARIFADO"
  | "COMPRAS"
  | "FINANCEIRO"
  | "DIRETORIA";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
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
  ENCARREGADO: ["OPERATION_CHECKLIST", "OPERATION_DDS", "OPERATION_QUALITY", "OPERATION_INVENTORY", "OPERATION_MAINTENANCE"],
  RECURSOS_HUMANOS: ["HR_ACCESS", "HR_DASHBOARD_VIEW", "EPI_VIEW", "EPI_COST_VIEW", "EPI_MANAGE", "EMPLOYEE_VIEW", "EMPLOYEE_MANAGE", "SCHEDULE_VIEW", "SCHEDULE_MANAGE", "OCCURRENCE_REGISTER", "OCCURRENCE_REVIEW", "OCCURRENCE_VIEW", "OCCURRENCE_EDIT", "OCCURRENCE_CANCEL", "WARNING_VIEW", "WARNING_REGISTER", "SUSPENSION_VIEW", "SUSPENSION_REGISTER", "WORK_ACCIDENT_VIEW", "WORK_ACCIDENT_REGISTER", "DOCUMENT_VIEW", "REPORT_EXPORT", "CATALOG_MANAGE", "DEPARTMENT_VIEW", "DEPARTMENT_CREATE", "DEPARTMENT_EDIT", "DEPARTMENT_DEACTIVATE", "DEPARTMENT_DELETE", "SAFETY_PEOPLE_VIEW", "SAFETY_PEOPLE_EXECUTE", "SAFETY_PEOPLE_MANAGE"],
  SEGURANCA_DO_TRABALHO: ["SAFETY_PEOPLE_VIEW", "SAFETY_PEOPLE_EXECUTE", "SAFETY_PEOPLE_MANAGE"],
  VENDEDOR: ["QUOTE_VIEW", "QUOTE_CREATE", "QUOTE_EDIT", "QUOTE_ISSUE", "QUOTE_DECIDE", "QUOTE_CANCEL", "QUOTE_DOCUMENT", "QUOTE_VALUE_VIEW", "QUOTE_CONVERT", "QUOTE_COST_VIEW", "QUOTE_MARGIN_VIEW", "QUOTE_PRICE_EDIT", "SALES_VIEW", "SALES_MANAGE", "CRM_VIEW", "CRM_MANAGE"],
  EXPEDICAO: ["EXPEDITION_VIEW", "EXPEDITION_MANAGE"],
  ALMOXARIFADO: ["HR_ACCESS", "EPI_VIEW", "EPI_MANAGE", "EMPLOYEE_VIEW", "REPORT_EXPORT"],
  MANUTENCAO: ["MAINTENANCE_VIEW", "MAINTENANCE_CREATE", "MAINTENANCE_MANAGE", "MAINTENANCE_COST_VIEW", "MAINTENANCE_REOPEN", "MAINTENANCE_PLAN_MANAGE", "MAINTENANCE_EXPORT"],
  OPERADOR: ["OPERATION_CHECKLIST"]
};

export function userHasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user) return false;
  if (user.checklistOnly) return permission === "OPERATION_CHECKLIST";
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
