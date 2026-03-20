import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export function EquipmentsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    type: "MAQUINA",
    department: "",
    model: "",
    serialNumber: "",
    hourmeter: "",
    mileage: ""
  });

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });

  const createEquipment = useMutation({
    mutationFn: (payload: any) => apiRequest("/equipments", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipments"] });
      setForm({ name: "", type: "MAQUINA", department: "", model: "", serialNumber: "", hourmeter: "", mileage: "" });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createEquipment.mutate({
      ...form,
      hourmeter: form.hourmeter ? Number(form.hourmeter) : null,
      mileage: form.mileage ? Number(form.mileage) : null
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
      <form onSubmit={submit} className="card space-y-3">
        <h2 className="text-lg font-bold">Cadastrar Equipamento</h2>
        <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome" required />
        <input className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="Tipo" required />
        <input className="input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Setor" required />
        <input className="input" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="Modelo" />
        <input className="input" value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} placeholder="Número de série" />
        <input className="input" type="number" value={form.hourmeter} onChange={(event) => setForm({ ...form, hourmeter: event.target.value })} placeholder="Horímetro" />
        <input className="input" type="number" value={form.mileage} onChange={(event) => setForm({ ...form, mileage: event.target.value })} placeholder="Quilometragem" />
        <button className="btn-primary w-full" disabled={createEquipment.isPending}>{createEquipment.isPending ? "Salvando..." : "Cadastrar"}</button>
      </form>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Equipamentos</h2>
        <div className="space-y-2">
          {equipmentsQuery.data?.map((equipment) => (
            <div key={equipment.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{equipment.name}</p>
              <p>{equipment.type} - {equipment.department}</p>
              <p>Série: {equipment.serialNumber || "-"}</p>
              <p>KM: {equipment.mileage ?? "-"} | Horímetro: {equipment.hourmeter ?? "-"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
