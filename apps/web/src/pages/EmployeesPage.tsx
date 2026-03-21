import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

type Employee = {
  id: string;
  name: string;
  registration: string;
  cpf?: string | null;
  department: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  admissionDate?: string | null;
  dismissalDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  user?: { id: string; email: string } | null;
  biometric?: {
    id: string;
    status: "SEM_BIOMETRIA" | "CADASTRADA" | "PENDENTE";
    provider: "UAREU_4500" | "MOCK" | "OUTRO";
    biometricExternalId?: string | null;
  } | null;
};

const emptyForm = {
  name: "",
  registration: "",
  cpf: "",
  department: "",
  position: "",
  phone: "",
  email: "",
  admissionDate: "",
  dismissalDate: "",
  notes: "",
  isActive: true
};

function biometricStatusLabel(status?: string) {
  if (status === "CADASTRADA") return "Biometria cadastrada";
  if (status === "PENDENTE") return "Biometria pendente";
  return "Sem biometria";
}

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ name: "", registration: "", department: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [biometricExternalId, setBiometricExternalId] = useState("");

  const employeesQuery = useQuery({
    queryKey: ["employees", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.name) params.set("name", filters.name);
      if (filters.registration) params.set("registration", filters.registration);
      if (filters.department) params.set("department", filters.department);
      return apiRequest<Employee[]>(`/employees?${params.toString()}`);
    }
  });

  const selectedEmployee = useMemo(
    () => employeesQuery.data?.find((employee) => employee.id === selectedId) ?? null,
    [employeesQuery.data, selectedId]
  );

  const employeeDetailsQuery = useQuery({
    queryKey: ["employee-details", selectedId],
    queryFn: () => apiRequest<any>(`/employees/${selectedId}`),
    enabled: Boolean(selectedId)
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (selectedEmployee) {
        return apiRequest(`/employees/${selectedEmployee.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/employees", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
      setForm(emptyForm);
      setSelectedId(null);
    }
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      apiRequest(`/employees/${payload.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: payload.isActive })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] })
  });

  const startBiometric = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest("/biometric/enroll/start", {
        method: "POST",
        body: JSON.stringify({ employeeId, provider: "UAREU_4500" })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] })
  });

  const finishBiometric = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest("/biometric/enroll/finish", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          biometricExternalId,
          provider: "UAREU_4500"
        })
      }),
    onSuccess: () => {
      setBiometricExternalId("");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
    }
  });

  const deleteBiometric = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest(`/employees/${employeeId}/biometric`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
    }
  });

  function loadEmployee(employee: Employee) {
    setSelectedId(employee.id);
    setForm({
      name: employee.name,
      registration: employee.registration,
      cpf: employee.cpf ?? "",
      department: employee.department,
      position: employee.position,
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      admissionDate: employee.admissionDate ? employee.admissionDate.slice(0, 10) : "",
      dismissalDate: employee.dismissalDate ? employee.dismissalDate.slice(0, 10) : "",
      notes: employee.notes ?? "",
      isActive: employee.isActive
    });
  }

  function clearForm() {
    setSelectedId(null);
    setForm(emptyForm);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate({
      ...form,
      cpf: form.cpf || null,
      phone: form.phone || null,
      email: form.email || null,
      admissionDate: form.admissionDate || null,
      dismissalDate: form.dismissalDate || null,
      notes: form.notes || null
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
      <section className="card space-y-4">
        <div>
          <h2 className="section-title">Funcionários e vínculos operacionais</h2>
          <p className="text-sm text-slate-500">Gestão completa com histórico de EPI, checklist e manutenção.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="input"
            placeholder="Nome"
            value={filters.name}
            onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="input"
            placeholder="Matrícula"
            value={filters.registration}
            onChange={(event) => setFilters((prev) => ({ ...prev, registration: event.target.value }))}
          />
          <input
            className="input"
            placeholder="Setor"
            value={filters.department}
            onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value }))}
          />
        </div>

        {employeesQuery.data?.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Nenhum funcionario cadastrado ainda. Use o formulario ao lado para criar o primeiro cadastro.
          </div>
        )}

        <div className="space-y-2">
          {employeesQuery.data?.map((employee) => (
            <div key={employee.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{employee.name}</p>
                  <p className="text-slate-500">
                    Mat. {employee.registration} | {employee.department} | {employee.position}
                  </p>
                  <p className="text-slate-500">{biometricStatusLabel(employee.biometric?.status)}</p>
                </div>
                <span className={employee.isActive ? "badge-success" : "badge-neutral"}>
                  {employee.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => loadEmployee(employee)}>
                  Abrir ficha
                </button>
                <button
                  className={employee.isActive ? "btn-danger" : "btn-primary"}
                  onClick={() => statusMutation.mutate({ id: employee.id, isActive: !employee.isActive })}
                >
                  {employee.isActive ? "Inativar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{selectedEmployee ? "Ficha do funcionário" : "Novo funcionário"}</h2>
          {selectedEmployee && (
            <button className="btn-secondary" onClick={clearForm}>
              Novo cadastro
            </button>
          )}
        </div>

        <form className="space-y-2" onSubmit={submit}>
          <input
            className="input"
            placeholder="Nome completo"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Matrícula"
              value={form.registration}
              onChange={(event) => setForm({ ...form, registration: event.target.value })}
              required
            />
            <input
              className="input"
              placeholder="CPF (opcional)"
              value={form.cpf}
              onChange={(event) => setForm({ ...form, cpf: event.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Setor"
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Função/cargo"
              value={form.position}
              onChange={(event) => setForm({ ...form, position: event.target.value })}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Telefone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
            <input
              className="input"
              placeholder="E-mail"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              type="date"
              placeholder="Admissão"
              value={form.admissionDate}
              onChange={(event) => setForm({ ...form, admissionDate: event.target.value })}
            />
            <input
              className="input"
              type="date"
              placeholder="Demissão"
              value={form.dismissalDate}
              onChange={(event) => setForm({ ...form, dismissalDate: event.target.value })}
            />
          </div>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Observações"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            Funcionário ativo
          </label>

          <button className="btn-primary w-full" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : selectedEmployee ? "Salvar alterações" : "Cadastrar funcionário"}
          </button>
        </form>

        {selectedEmployee && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="font-semibold">Biometria U.are.U 4500 (integração via agente local)</h3>
            <p className="text-sm text-slate-600">Status: {biometricStatusLabel(selectedEmployee.biometric?.status)}</p>
            <div className="grid gap-2">
              <button className="btn-secondary" onClick={() => startBiometric.mutate(selectedEmployee.id)}>
                Iniciar vínculo biométrico
              </button>
              <input
                className="input"
                placeholder="ID retornado pelo agente local"
                value={biometricExternalId}
                onChange={(event) => setBiometricExternalId(event.target.value)}
              />
              <button
                className="btn-primary"
                onClick={() => finishBiometric.mutate(selectedEmployee.id)}
                disabled={!biometricExternalId || finishBiometric.isPending}
              >
                Confirmar biometria vinculada
              </button>
              <button className="btn-danger" onClick={() => deleteBiometric.mutate(selectedEmployee.id)}>
                Remover biometria
              </button>
            </div>
          </div>
        )}

        {employeeDetailsQuery.data && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="font-semibold">Histórico operacional do funcionário</h3>
            <p className="text-sm text-slate-600">
              EPIs: {employeeDetailsQuery.data.epiMovements.length} | Checklists executados:{" "}
              {employeeDetailsQuery.data.checklistExecutions.length} | Ocorrências/manutenções relacionadas:{" "}
              {employeeDetailsQuery.data.relatedChecklistMaintenances.length}
            </p>
            <div className="space-y-2">
              {employeeDetailsQuery.data.epiMovements.slice(0, 5).map((item: any) => (
                <p key={item.id} className="text-sm">
                  EPI: {item.epi.name} | {item.movementType} | {new Date(item.date).toLocaleDateString("pt-BR")}
                </p>
              ))}
              {employeeDetailsQuery.data.checklistExecutions.slice(0, 5).map((item: any) => (
                <p key={item.id} className="text-sm">
                  Checklist: {item.template.name} ({item.equipment.name}) |{" "}
                  {new Date(item.executedAt).toLocaleDateString("pt-BR")}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
