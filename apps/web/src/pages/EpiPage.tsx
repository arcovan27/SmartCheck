import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

const epiFormInitial = {
  name: "",
  description: "",
  ca: "",
  category: "",
  validityDate: "",
  unit: "UN",
  stock: 0,
  minimumStock: 0,
  isActive: true
};

export function EpiPage() {
  const queryClient = useQueryClient();
  const [epiForm, setEpiForm] = useState(epiFormInitial);
  const [deliveryForm, setDeliveryForm] = useState({
    employeeId: "",
    epiId: "",
    movementType: "ENTREGA",
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    confirmationMethod: "LOGIN",
    confirmationBiometricId: ""
  });
  const [reportEmployeeId, setReportEmployeeId] = useState("");

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => apiRequest<any[]>("/employees") });
  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<any[]>("/epis") });
  const movementsQuery = useQuery({ queryKey: ["epi-deliveries"], queryFn: () => apiRequest<any[]>("/epi-deliveries") });

  const reportQuery = useQuery({
    queryKey: ["epi-report", reportEmployeeId],
    queryFn: () => apiRequest<any>(`/reports/epi-by-employee/${reportEmployeeId}`),
    enabled: Boolean(reportEmployeeId)
  });

  const createEpi = useMutation({
    mutationFn: (payload: any) => apiRequest("/epis", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      setEpiForm(epiFormInitial);
    }
  });

  const createMovement = useMutation({
    mutationFn: (payload: any) => apiRequest("/epi-deliveries", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epi-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      setDeliveryForm((prev) => ({ ...prev, quantity: 1, notes: "", confirmationBiometricId: "" }));
    }
  });

  function submitEpi(event: FormEvent) {
    event.preventDefault();
    createEpi.mutate({
      ...epiForm,
      validityDate: epiForm.validityDate || null,
      stock: Number(epiForm.stock),
      minimumStock: Number(epiForm.minimumStock)
    });
  }

  function submitMovement(event: FormEvent) {
    event.preventDefault();
    createMovement.mutate({
      ...deliveryForm,
      quantity: Number(deliveryForm.quantity),
      confirmationBiometricId:
        deliveryForm.confirmationMethod === "BIOMETRIA" ? deliveryForm.confirmationBiometricId || null : null
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={submitEpi} className="card space-y-2">
          <h2 className="section-title">Cadastro de EPI</h2>
          <input className="input" placeholder="Nome" value={epiForm.name} onChange={(e) => setEpiForm({ ...epiForm, name: e.target.value })} required />
          <textarea className="textarea" placeholder="Descrição" value={epiForm.description} onChange={(e) => setEpiForm({ ...epiForm, description: e.target.value })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="CA" value={epiForm.ca} onChange={(e) => setEpiForm({ ...epiForm, ca: e.target.value })} required />
            <input className="input" placeholder="Categoria" value={epiForm.category} onChange={(e) => setEpiForm({ ...epiForm, category: e.target.value })} required />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="input" placeholder="Unidade" value={epiForm.unit} onChange={(e) => setEpiForm({ ...epiForm, unit: e.target.value })} required />
            <input className="input" type="number" min={0} placeholder="Estoque" value={epiForm.stock} onChange={(e) => setEpiForm({ ...epiForm, stock: Number(e.target.value) })} required />
            <input className="input" type="number" min={0} placeholder="Estoque mínimo" value={epiForm.minimumStock} onChange={(e) => setEpiForm({ ...epiForm, minimumStock: Number(e.target.value) })} required />
          </div>
          <input className="input" type="date" value={epiForm.validityDate} onChange={(e) => setEpiForm({ ...epiForm, validityDate: e.target.value })} />

          <button className="btn-primary w-full" disabled={createEpi.isPending}>
            {createEpi.isPending ? "Salvando..." : "Cadastrar EPI"}
          </button>
        </form>

        <form onSubmit={submitMovement} className="card space-y-2">
          <h2 className="section-title">Entrega / devolução de EPI</h2>
          <select className="select" value={deliveryForm.employeeId} onChange={(e) => setDeliveryForm({ ...deliveryForm, employeeId: e.target.value })} required>
            <option value="">Funcionário</option>
            {employeesQuery.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <select className="select" value={deliveryForm.epiId} onChange={(e) => setDeliveryForm({ ...deliveryForm, epiId: e.target.value })} required>
            <option value="">EPI</option>
            {episQuery.data?.map((epi) => (
              <option key={epi.id} value={epi.id}>
                {epi.name}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="select" value={deliveryForm.movementType} onChange={(e) => setDeliveryForm({ ...deliveryForm, movementType: e.target.value })}>
              <option value="ENTREGA">Entrega</option>
              <option value="DEVOLUCAO">Devolução</option>
            </select>
            <input className="input" type="number" min={1} value={deliveryForm.quantity} onChange={(e) => setDeliveryForm({ ...deliveryForm, quantity: Number(e.target.value) })} required />
          </div>
          <input className="input" type="date" value={deliveryForm.date} onChange={(e) => setDeliveryForm({ ...deliveryForm, date: e.target.value })} required />
          <select className="select" value={deliveryForm.confirmationMethod} onChange={(e) => setDeliveryForm({ ...deliveryForm, confirmationMethod: e.target.value })}>
            <option value="LOGIN">Confirmação por login</option>
            <option value="BIOMETRIA">Confirmação por biometria</option>
          </select>
          {deliveryForm.confirmationMethod === "BIOMETRIA" && (
            <input className="input" placeholder="ID externo da biometria" value={deliveryForm.confirmationBiometricId} onChange={(e) => setDeliveryForm({ ...deliveryForm, confirmationBiometricId: e.target.value })} required />
          )}
          <textarea className="textarea" rows={2} placeholder="Observação" value={deliveryForm.notes} onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} />
          <button className="btn-primary w-full" disabled={createMovement.isPending}>
            {createMovement.isPending ? "Salvando..." : "Registrar movimentação"}
          </button>
          {createMovement.isError && <p className="text-sm text-red-700">{(createMovement.error as Error).message}</p>}
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">EPIs cadastrados</h2>
          <div className="space-y-2">
            {episQuery.data?.map((epi) => (
              <div key={epi.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{epi.name}</p>
                <p className="text-slate-500">CA {epi.ca} • {epi.category}</p>
                <p>
                  Estoque: <strong>{epi.stock}</strong> ({epi.unit}) • Mínimo: {epi.minimumStock}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-title mb-3">Histórico de movimentações</h2>
          <div className="space-y-2">
            {movementsQuery.data?.map((movement) => (
              <div key={movement.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">
                  {movement.employee.name} • {movement.epi.name}
                </p>
                <p>
                  {movement.movementType} • Quantidade: {movement.quantity}
                </p>
                <p className="text-slate-500">{new Date(movement.date).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="section-title">Ficha de EPI do funcionário</h2>
        <select className="select max-w-md" value={reportEmployeeId} onChange={(e) => setReportEmployeeId(e.target.value)}>
          <option value="">Selecione um funcionário</option>
          {employeesQuery.data?.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>

        {reportQuery.isLoading && reportEmployeeId && <p>Carregando ficha...</p>}

        {reportQuery.data && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Funcionário: <strong>{reportQuery.data.employee.name}</strong>
            </p>
            {reportQuery.data.deliveries.length === 0 && <p className="text-sm text-slate-500">Sem registros de EPI para este funcionário.</p>}
            {reportQuery.data.deliveries.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{item.epi.name}</p>
                <p>
                  {item.movementType} • Quantidade: {item.quantity}
                </p>
                <p className="text-slate-500">{new Date(item.date).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
