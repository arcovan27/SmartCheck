import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export function MaintenancePage() {
  const queryClient = useQueryClient();
  const [maintenanceForm, setMaintenanceForm] = useState({ equipmentId: "", type: "CORRECTIVE", description: "", priority: "MEDIUM" });
  const [planForm, setPlanForm] = useState({ equipmentId: "", title: "", triggerType: "DAYS", threshold: 30, nearThreshold: 25 });

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const maintenancesQuery = useQuery({ queryKey: ["maintenances"], queryFn: () => apiRequest<any[]>("/maintenances") });
  const plansQuery = useQuery({ queryKey: ["maintenance-plans"], queryFn: () => apiRequest<any[]>("/maintenance-plans") });
  const alertsQuery = useQuery({ queryKey: ["maintenance-alerts"], queryFn: () => apiRequest<any[]>("/maintenance-alerts") });

  const createMaintenance = useMutation({
    mutationFn: (payload: any) => apiRequest("/maintenances", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      setMaintenanceForm((prev) => ({ ...prev, description: "" }));
    }
  });

  const createPlan = useMutation({
    mutationFn: (payload: any) => apiRequest("/maintenance-plans", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-plans"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-alerts"] });
      setPlanForm((prev) => ({ ...prev, title: "" }));
    }
  });

  function submitMaintenance(event: FormEvent) {
    event.preventDefault();
    createMaintenance.mutate(maintenanceForm);
  }

  function submitPlan(event: FormEvent) {
    event.preventDefault();
    createPlan.mutate({
      ...planForm,
      threshold: Number(planForm.threshold),
      nearThreshold: Number(planForm.nearThreshold)
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-3" onSubmit={submitMaintenance}>
          <h2 className="text-lg font-bold">Nova Manutenção</h2>
          <select className="input" value={maintenanceForm.equipmentId} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, equipmentId: event.target.value })} required>
            <option value="">Equipamento</option>
            {equipmentsQuery.data?.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.name}</option>)}
          </select>
          <select className="input" value={maintenanceForm.type} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, type: event.target.value })}>
            <option value="PREVENTIVE">Preventiva</option>
            <option value="CORRECTIVE">Corretiva</option>
          </select>
          <select className="input" value={maintenanceForm.priority} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, priority: event.target.value })}>
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
            <option value="CRITICAL">Crítica</option>
          </select>
          <textarea className="input" rows={3} placeholder="Descrição" value={maintenanceForm.description} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} required />
          <button className="btn-primary w-full" disabled={createMaintenance.isPending}>{createMaintenance.isPending ? "Salvando..." : "Registrar manutenção"}</button>
        </form>

        <form className="card space-y-3" onSubmit={submitPlan}>
          <h2 className="text-lg font-bold">Plano Preventivo Automático</h2>
          <select className="input" value={planForm.equipmentId} onChange={(event) => setPlanForm({ ...planForm, equipmentId: event.target.value })} required>
            <option value="">Equipamento</option>
            {equipmentsQuery.data?.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.name}</option>)}
          </select>
          <input className="input" placeholder="Título" value={planForm.title} onChange={(event) => setPlanForm({ ...planForm, title: event.target.value })} required />
          <select className="input" value={planForm.triggerType} onChange={(event) => setPlanForm({ ...planForm, triggerType: event.target.value })}>
            <option value="DAYS">Por dias</option>
            <option value="KM">Por KM</option>
            <option value="HOURMETER">Por horímetro</option>
          </select>
          <input className="input" type="number" placeholder="Limite" value={planForm.threshold} onChange={(event) => setPlanForm({ ...planForm, threshold: Number(event.target.value) })} required />
          <input className="input" type="number" placeholder="Alerta antecipado" value={planForm.nearThreshold} onChange={(event) => setPlanForm({ ...planForm, nearThreshold: Number(event.target.value) })} required />
          <button className="btn-primary w-full" disabled={createPlan.isPending}>{createPlan.isPending ? "Salvando..." : "Criar plano"}</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 text-lg font-bold">Ordens de Manutenção</h2>
          <div className="space-y-2">
            {maintenancesQuery.data?.map((maintenance) => (
              <div key={maintenance.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{maintenance.equipment.name}</p>
                <p>{maintenance.description}</p>
                <p>Status: {maintenance.status} | Prioridade: {maintenance.priority}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-2 text-lg font-bold">Alertas de Preventiva</h2>
          <div className="space-y-2">
            {alertsQuery.data?.map((alert, index) => (
              <div key={index} className={`rounded-xl p-3 text-sm ${alert.alert.state === "DUE" ? "bg-red-50 border border-red-300" : alert.alert.state === "NEAR" ? "bg-amber-50 border border-amber-300" : "bg-emerald-50 border border-emerald-200"}`}>
                <p className="font-semibold">{alert.equipment.name}</p>
                <p>{alert.plan.title}</p>
                <p>{alert.alert.triggerType}: {Number(alert.alert.currentValue).toFixed(1)} / {Number(alert.alert.threshold).toFixed(1)} ({alert.alert.state})</p>
              </div>
            ))}
          </div>
          <h3 className="mt-4 mb-2 text-base font-bold">Planos cadastrados</h3>
          <div className="space-y-2">
            {plansQuery.data?.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{plan.equipment.name} - {plan.title}</p>
                <p>{plan.triggerType} | Limite {plan.threshold}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
