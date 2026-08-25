import type { UserRole } from "./auth";

export const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  ENCARREGADO: "Encarregado",
  MANUTENCAO: "Manutenção",
  OPERADOR: "Operador",
  RECURSOS_HUMANOS: "Recursos Humanos",
  SEGURANCA_DO_TRABALHO: "Técnico de Segurança do Trabalho",
  VENDEDOR: "Vendedor",
  EXPEDICAO: "Expedição",
  ALMOXARIFADO: "Almoxarifado",
  COMPRAS: "Compras",
  FINANCEIRO: "Financeiro",
  DIRETORIA: "Diretoria"
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
