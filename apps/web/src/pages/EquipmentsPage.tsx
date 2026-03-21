import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

const initialForm = {
  name: "",
  type: "MAQUINA",
  department: "",
  model: "",
  serialNumber: "",
  hourmeter: "",
  mileage: "",
  manufacturer: "",
  assetTag: "",
  notes: "",
  isActive: true
};

export function EquipmentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const equipmentsQuery = useQuery({
    queryKey: ["equipments", search],
    queryFn: () => apiRequest<any[]>(`/equipments${search ? `?search=${encodeURIComponent(search)}` : ""}`)
  });

  const equipmentDetailsQuery = useQuery({
    queryKey: ["equipment-details", selectedId],
    queryFn: () => apiRequest<any>(`/equipments/${selectedId}`),
    enabled: Boolean(selectedId)
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (selectedId) {
        return apiRequest(`/equipments/${selectedId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/equipments", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipments"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["equipment-details", selectedId] });
      setSelectedId(null);
      setForm(initialForm);
    }
  });

  function selectEquipment(equipment: any) {
    setSelectedId(equipment.id);
    setForm({
      name: equipment.name,
      type: equipment.type,
      department: equipment.department,
      model: equipment.model ?? "",
      serialNumber: equipment.serialNumber ?? "",
      hourmeter: equipment.hourmeter?.toString() ?? "",
      mileage: equipment.mileage?.toString() ?? "",
      manufacturer: equipment.manufacturer ?? "",
      assetTag: equipment.assetTag ?? "",
      notes: equipment.notes ?? "",
      isActive: equipment.isActive
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate({
      ...form,
      serialNumber: form.serialNumber || null,
      model: form.model || null,
      hourmeter: form.hourmeter ? Number(form.hourmeter) : null,
      mileage: form.mileage ? Number(form.mileage) : null,
      manufacturer: form.manufacturer || null,
      assetTag: form.assetTag || null,
      notes: form.notes || null
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Equipamentos e veículos</h2>
            <input className="input max-w-sm" placeholder="Buscar por nome, modelo, série" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="space-y-2">
            {equipmentsQuery.data?.map((equipment) => (
              <div key={equipment.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{equipment.name}</p>
                    <p className="text-slate-500">
                      {equipment.type} • {equipment.department}
                    </p>
                    <p className="text-slate-500">Série: {equipment.serialNumber || "-"}</p>
                    <p>
                      Horímetro: {equipment.hourmeter ?? "-"} • KM: {equipment.mileage ?? "-"}
                    </p>
                  </div>
                  <button className="btn-secondary" onClick={() => selectEquipment(equipment)}>
                    Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <form className="card space-y-2" onSubmit={submit}>
          <h2 className="section-title">{selectedId ? "Editar equipamento" : "Novo equipamento"}</h2>
          <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="MAQUINA">Máquina</option>
              <option value="VEICULO">Veículo</option>
              <option value="EQUIPAMENTO">Equipamento</option>
            </select>
            <input className="input" placeholder="Setor" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Modelo" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input className="input" placeholder="Número de série" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Fabricante" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            <input className="input" placeholder="Patrimônio" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" type="number" placeholder="Horímetro" value={form.hourmeter} onChange={(e) => setForm({ ...form, hourmeter: e.target.value })} />
            <input className="input" type="number" placeholder="Quilometragem" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
          </div>
          <textarea className="textarea" rows={3} placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Equipamento ativo
          </label>
          <button className="btn-primary w-full" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : selectedId ? "Salvar alterações" : "Cadastrar equipamento"}
          </button>
        </form>
      </div>

      <section className="card">
        <h2 className="section-title mb-2">Histórico resumido do equipamento</h2>
        {!selectedId && <p className="text-sm text-slate-500">Selecione um equipamento para visualizar o histórico.</p>}
        {equipmentDetailsQuery.isLoading && <p>Carregando detalhes...</p>}
        {equipmentDetailsQuery.data && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold">Últimas manutenções</h3>
              <div className="space-y-2">
                {equipmentDetailsQuery.data.maintenances.map((maintenance: any) => (
                  <div key={maintenance.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="font-semibold">{maintenance.description}</p>
                    <p className="text-slate-500">
                      {maintenance.type} • {maintenance.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Últimos checklists</h3>
              <div className="space-y-2">
                {equipmentDetailsQuery.data.checklistExecutions.map((execution: any) => (
                  <div key={execution.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="font-semibold">{execution.template.name}</p>
                    <p>
                      {execution.hadProblem ? "Com problema" : "Sem problema"} • {new Date(execution.executedAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
