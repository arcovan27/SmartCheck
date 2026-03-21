import type { UserRole } from "./auth";

export const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANUTENCAO: "Manutenção",
  OPERADOR: "Operador",
  SEGURANCA_DO_TRABALHO: "Segurança do Trabalho",
  ALMOXARIFADO: "Almoxarifado"
};

export const maintenanceStatusLabels: Record<string, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída"
};

export const maintenancePriorityLabels: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica"
};
