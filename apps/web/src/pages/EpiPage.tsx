import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export function EpiPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", epiId: "", quantity: 1, caNumber: "", deliveredAt: new Date().toISOString().slice(0, 10) });

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => apiRequest<any[]>("/employees") });
  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<any[]>("/epis") });
  const deliveriesQuery = useQuery({ queryKey: ["epi-deliveries"], queryFn: () => apiRequest<any[]>("/epi-deliveries") });

  const createDelivery = useMutation({
    mutationFn: (payload: any) => apiRequest("/epi-deliveries", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epi-deliveries"] });
      setForm((prev) => ({ ...prev, quantity: 1, caNumber: "" }));
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createDelivery.mutate({
      ...form,
      quantity: Number(form.quantity),
      deliveredAt: form.deliveredAt
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,1.3fr]">
      <form onSubmit={submit} className="card space-y-3">
        <h2 className="text-lg font-bold">Registrar Entrega de EPI</h2>
        <select className="input" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required>
          <option value="">Funcionário</option>
          {employeesQuery.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
        <select className="input" value={form.epiId} onChange={(event) => setForm({ ...form, epiId: event.target.value })} required>
          <option value="">EPI</option>
          {episQuery.data?.map((epi) => <option key={epi.id} value={epi.id}>{epi.name}</option>)}
        </select>
        <input className="input" type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} placeholder="Quantidade" required />
        <input className="input" value={form.caNumber} onChange={(event) => setForm({ ...form, caNumber: event.target.value })} placeholder="Número do CA" required />
        <input className="input" type="date" value={form.deliveredAt} onChange={(event) => setForm({ ...form, deliveredAt: event.target.value })} required />
        <button className="btn-primary w-full" disabled={createDelivery.isPending}>{createDelivery.isPending ? "Salvando..." : "Registrar"}</button>
        {createDelivery.isError && <p className="text-sm text-red-600">{(createDelivery.error as Error).message}</p>}
      </form>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Histórico de EPI</h2>
        <div className="space-y-2">
          {deliveriesQuery.data?.map((delivery) => (
            <div key={delivery.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{delivery.employee.name} - {delivery.epi.name}</p>
              <p>Quantidade: {delivery.quantity} | CA: {delivery.caNumber}</p>
              <p>Data: {new Date(delivery.deliveredAt).toLocaleDateString("pt-BR")}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
