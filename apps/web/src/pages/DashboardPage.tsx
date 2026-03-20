import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

type AlertItem = {
  equipment: { name: string };
  plan: { title: string };
  alert: { state: "OK" | "NEAR" | "DUE"; currentValue: number; threshold: number; triggerType: string };
};

export function DashboardPage() {
  const alertsQuery = useQuery({
    queryKey: ["maintenance-alerts"],
    queryFn: () => apiRequest<AlertItem[]>("/maintenance-alerts")
  });

  const maintenanceQuery = useQuery({
    queryKey: ["maintenances"],
    queryFn: () => apiRequest<any[]>("/maintenances")
  });

  const checklistQuery = useQuery({
    queryKey: ["checklist-executions"],
    queryFn: () => apiRequest<any[]>("/checklist-executions")
  });

  const dueAlerts = alertsQuery.data?.filter((item) => item.alert.state !== "OK") ?? [];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Alertas preventivos</p>
          <p className="text-3xl font-bold text-amber-600">{dueAlerts.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Manutenções abertas</p>
          <p className="text-3xl font-bold text-red-600">{maintenanceQuery.data?.filter((m) => m.status !== "DONE").length ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Checklists executados</p>
          <p className="text-3xl font-bold text-brand-700">{checklistQuery.data?.length ?? 0}</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Alertas de Preventiva</h2>
        {alertsQuery.isLoading && <p>Carregando...</p>}
        {!alertsQuery.isLoading && dueAlerts.length === 0 && <p className="text-sm text-slate-500">Sem alertas próximos/vencidos.</p>}
        <div className="space-y-2">
          {dueAlerts.map((item, index) => (
            <div key={`${item.plan.title}-${index}`} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold">{item.equipment.name} - {item.plan.title}</p>
              <p className="text-sm text-slate-700">
                {item.alert.triggerType}: {item.alert.currentValue.toFixed(1)} / {item.alert.threshold.toFixed(1)} ({item.alert.state})
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
