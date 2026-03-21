import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { maintenancePriorityLabels, maintenanceStatusLabels } from "../lib/constants";

type DashboardResponse = {
  cards: {
    activeEmployees: number;
    totalEpis: number;
    activeEquipments: number;
    openMaintenances: number;
    pendingChecklists: number;
    duePreventiveAlerts: number;
  };
  recentMaintenances: Array<any>;
  recentChecklistProblems: Array<any>;
  recentEpiDeliveries: Array<any>;
};

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiRequest<DashboardResponse>("/dashboard/summary")
  });

  if (summaryQuery.isLoading) {
    return <div className="card">Carregando dashboard...</div>;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <div className="card text-red-700">Falha ao carregar o dashboard.</div>;
  }

  const { cards, recentMaintenances, recentChecklistProblems, recentEpiDeliveries } = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Funcionários ativos</p>
          <p className="kpi-value text-brand-700">{cards.activeEmployees}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">EPIs cadastrados</p>
          <p className="kpi-value text-brand-700">{cards.totalEpis}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Equipamentos ativos</p>
          <p className="kpi-value text-brand-700">{cards.activeEquipments}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Manutenções em aberto</p>
          <p className="kpi-value text-red-700">{cards.openMaintenances}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Checklists pendentes</p>
          <p className="kpi-value text-amber-700">{cards.pendingChecklists}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Alertas preventivos</p>
          <p className="kpi-value text-orange-700">{cards.duePreventiveAlerts}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card">
          <h2 className="section-title mb-3">Últimas manutenções</h2>
          <div className="space-y-2">
            {recentMaintenances.length === 0 && <p className="text-sm text-slate-500">Nenhuma manutenção registrada.</p>}
            {recentMaintenances.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{item.equipment.name}</p>
                <p>{item.description}</p>
                <p className="text-slate-500">
                  {maintenanceStatusLabels[item.status] ?? item.status} • {maintenancePriorityLabels[item.priority] ?? item.priority}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-title mb-3">Últimos checklists com problema</h2>
          <div className="space-y-2">
            {recentChecklistProblems.length === 0 && <p className="text-sm text-slate-500">Sem problemas recentes.</p>}
            {recentChecklistProblems.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{item.equipment.name}</p>
                <p>{item.template.name}</p>
                <p className="text-slate-500">Operador: {item.employee.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-title mb-3">Últimos EPIs entregues</h2>
          <div className="space-y-2">
            {recentEpiDeliveries.length === 0 && <p className="text-sm text-slate-500">Sem movimentações recentes.</p>}
            {recentEpiDeliveries.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">
                  {item.employee.name} • {item.epi.name}
                </p>
                <p>Quantidade: {item.quantity}</p>
                <p className="text-slate-500">{new Date(item.date).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
