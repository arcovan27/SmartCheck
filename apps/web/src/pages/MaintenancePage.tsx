import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { maintenancePriorityLabels, maintenanceStatusLabels } from "../lib/constants";

export function MaintenancePage() {
  const queryClient = useQueryClient();
  const [maintenanceForm, setMaintenanceForm] = useState({
    equipmentId: "",
    type: "CORRETIVA",
    priority: "MEDIA",
    status: "ABERTA",
    description: "",
    cause: "",
    responsibleId: "",
    notes: ""
  });
  const [planForm, setPlanForm] = useState({
    equipmentId: "",
    title: "",
    description: "",
    triggerType: "DAYS",
    threshold: 30,
    nearThreshold: 25
  });

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => apiRequest<any[]>("/employees") });
  const maintenancesQuery = useQuery({ queryKey: ["maintenances"], queryFn: () => apiRequest<any[]>("/maintenances") });
  const plansQuery = useQuery({ queryKey: ["maintenance-plans"], queryFn: () => apiRequest<any[]>("/maintenance-plans") });
  const alertsQuery = useQuery({ queryKey: ["maintenance-alerts"], queryFn: () => apiRequest<any[]>("/maintenance-alerts") });

  const createMaintenance = useMutation({
    mutationFn: (payload: any) => apiRequest("/maintenances", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      setMaintenanceForm((prev) => ({ ...prev, description: "", cause: "", notes: "" }));
    }
  });

  const updateMaintenance = useMutation({
    mutationFn: (payload: any) =>
      apiRequest(`/maintenances/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenances"] })
  });

  const createPlan = useMutation({
    mutationFn: (payload: any) => apiRequest("/maintenance-plans", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-plans"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-alerts"] });
      setPlanForm((prev) => ({ ...prev, title: "", description: "" }));
    }
  });

  function submitMaintenance(event: FormEvent) {
    event.preventDefault();
    createMaintenance.mutate({
      ...maintenanceForm,
      responsibleId: maintenanceForm.responsibleId || null,
      cause: maintenanceForm.cause || null,
      notes: maintenanceForm.notes || null
    });
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
      <div className="grid gap-4 xl:grid-cols-2">
        <form className="card space-y-2" onSubmit={submitMaintenance}>
          <h2 className="section-title">Abrir manutenção</h2>
          <select className="select" value={maintenanceForm.equipmentId} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, equipmentId: e.target.value })} required>
            <option value="">Equipamento</option>
            {equipmentsQuery.data?.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-3">
            <select className="select" value={maintenanceForm.type} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })}>
              <option value="PREVENTIVA">Preventiva</option>
              <option value="CORRETIVA">Corretiva</option>
            </select>
            <select className="select" value={maintenanceForm.priority} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </select>
            <select className="select" value={maintenanceForm.status} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, status: e.target.value })}>
              <option value="ABERTA">Aberta</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDA">Concluída</option>
            </select>
          </div>
          <textarea className="textarea" rows={2} placeholder="Descrição" value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} required />
          <textarea className="textarea" rows={2} placeholder="Causa" value={maintenanceForm.cause} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cause: e.target.value })} />
          <select className="select" value={maintenanceForm.responsibleId} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, responsibleId: e.target.value })}>
            <option value="">Responsável</option>
            {employeesQuery.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
          <textarea className="textarea" rows={2} placeholder="Observações" value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} />
          <button className="btn-primary w-full" disabled={createMaintenance.isPending}>{createMaintenance.isPending ? "Salvando..." : "Registrar manutenção"}</button>
        </form>

        <form className="card space-y-2" onSubmit={submitPlan}>
          <h2 className="section-title">Plano preventivo</h2>
          <select className="select" value={planForm.equipmentId} onChange={(e) => setPlanForm({ ...planForm, equipmentId: e.target.value })} required>
            <option value="">Equipamento</option>
            {equipmentsQuery.data?.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
            ))}
          </select>
          <input className="input" placeholder="Título" value={planForm.title} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} required />
          <textarea className="textarea" rows={2} placeholder="Descrição" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          <select className="select" value={planForm.triggerType} onChange={(e) => setPlanForm({ ...planForm, triggerType: e.target.value })}>
            <option value="DAYS">Dias</option>
            <option value="KM">KM</option>
            <option value="HOURMETER">Horímetro</option>
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" type="number" placeholder="Limite" value={planForm.threshold} onChange={(e) => setPlanForm({ ...planForm, threshold: Number(e.target.value) })} required />
            <input className="input" type="number" placeholder="Alerta antecipado" value={planForm.nearThreshold} onChange={(e) => setPlanForm({ ...planForm, nearThreshold: Number(e.target.value) })} required />
          </div>
          <button className="btn-primary w-full" disabled={createPlan.isPending}>{createPlan.isPending ? "Salvando..." : "Criar plano"}</button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">Ordens de manutenção</h2>
          <div className="space-y-2">
            {maintenancesQuery.data?.map((maintenance) => (
              <div key={maintenance.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{maintenance.equipment.name}</p>
                    <p>{maintenance.description}</p>
                    <p className="text-slate-500">
                      {maintenanceStatusLabels[maintenance.status] ?? maintenance.status} • {maintenancePriorityLabels[maintenance.priority] ?? maintenance.priority}
                    </p>
                  </div>
                  <select className="select max-w-[170px]" value={maintenance.status} onChange={(e) => updateMaintenance.mutate({ id: maintenance.id, data: { status: e.target.value } })}>
                    <option value="ABERTA">Aberta</option>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="CONCLUIDA">Concluída</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="section-title">Alertas e planos</h2>
          <div className="space-y-2">
            {alertsQuery.data?.map((alert, index) => (
              <div key={index} className={`rounded-xl border p-3 text-sm ${alert.alert.state === "DUE" ? "border-red-300 bg-red-50" : alert.alert.state === "NEAR" ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className="font-semibold">{alert.equipment.name}</p>
                <p>{alert.plan.title}</p>
                <p>
                  {alert.alert.triggerType}: {Number(alert.alert.currentValue).toFixed(1)} / {Number(alert.alert.threshold).toFixed(1)}
                </p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Planos cadastrados</h3>
            <div className="space-y-2">
              {plansQuery.data?.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-semibold">{plan.equipment.name}</p>
                  <p>{plan.title}</p>
                  <p className="text-slate-500">{plan.triggerType} • Limite {plan.threshold}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
