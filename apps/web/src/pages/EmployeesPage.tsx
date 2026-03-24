import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, apiRequest, getUploadedFileUrl, uploadFile } from "../lib/api";

type Employee = {
  id: string;
  name: string;
  registration: string;
  cpf?: string | null;
  department: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  photoPath?: string | null;
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
  photoPath: "",
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
  const biometricAgentUrl = import.meta.env.VITE_BIOMETRIC_AGENT_URL ?? "http://127.0.0.1:4100";
  const [filters, setFilters] = useState({ name: "", registration: "", department: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [biometricExternalId, setBiometricExternalId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [photoFile]);

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
    mutationFn: async (payload: any) => {
      let photoPath = payload.photoPath;

      if (photoFile) {
        const uploadedPhoto = await uploadFile(photoFile);
        photoPath = uploadedPhoto.path;
      }

      const payloadWithPhoto = {
        ...payload,
        photoPath: photoPath || null
      };

      if (selectedEmployee) {
        return apiRequest(`/employees/${selectedEmployee.id}`, {
          method: "PATCH",
          body: JSON.stringify(payloadWithPhoto)
        });
      }

      return apiRequest("/employees", {
        method: "POST",
        body: JSON.stringify(payloadWithPhoto)
      });
    },
    onSuccess: () => {
      setActionMessage("");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
      setForm(emptyForm);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setSelectedId(null);
    }
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      apiRequest(`/employees/${payload.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: payload.isActive })
      }),
    onSuccess: async (_, payload) => {
      setActionMessage("");
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId === payload.id) {
        setForm((prev) => ({ ...prev, isActive: payload.isActive }));
        await queryClient.invalidateQueries({ queryKey: ["employee-details", payload.id] });
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest<{ message: string }>(`/employees/${employeeId}`, {
        method: "DELETE"
      }),
    onSuccess: async (_, employeeId) => {
      setActionMessage("Funcionario excluido com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId === employeeId) {
        setSelectedId(null);
        setForm(emptyForm);
        setPhotoFile(null);
        setPhotoPreviewUrl(null);
      }
    }
  });

  const startBiometric = useMutation({
    mutationFn: (employeeId: string) =>
      apiRequest("/biometric/enroll/start", {
        method: "POST",
        body: JSON.stringify({ employeeId, provider: "UAREU_4500" })
      }),
    onSuccess: () => {
      setActionMessage("Vinculo biometrico iniciado. Informe o ID e confirme.");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
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
      setActionMessage("Biometria vinculada com sucesso.");
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

  const enrollWithAgent = useMutation({
    mutationFn: async (employeeId: string) => {
      const token = localStorage.getItem("smartcheck.token");
      if (!token) {
        throw new Error("Sessao expirada. Faca login novamente.");
      }

      const response = await fetch(`${biometricAgentUrl}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          provider: "UAREU_4500",
          apiBaseUrl: API_URL,
          token
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: "Falha ao comunicar com agente local" }));
        throw new Error(data.message ?? "Falha ao comunicar com agente local");
      }

      return response.json() as Promise<{ biometricExternalId?: string }>;
    },
    onSuccess: async (result, employeeId) => {
      setActionMessage("Biometria cadastrada pelo agente local com sucesso.");
      if (result.biometricExternalId) {
        setBiometricExternalId(result.biometricExternalId);
      }
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-details", employeeId] });
    }
  });

  function loadEmployee(employee: Employee) {
    setActionMessage("");
    setSelectedId(employee.id);
    setForm({
      name: employee.name,
      registration: employee.registration,
      cpf: employee.cpf ?? "",
      department: employee.department,
      position: employee.position,
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      photoPath: employee.photoPath ?? "",
      notes: employee.notes ?? "",
      isActive: employee.isActive
    });
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  }

  function clearForm() {
    setActionMessage("");
    setSelectedId(null);
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate({
      ...form,
      cpf: form.cpf || null,
      phone: form.phone || null,
      email: form.email || null,
      photoPath: form.photoPath || null,
      notes: form.notes || null
    });
  }

  const employeePhotoUrl = photoPreviewUrl ?? getUploadedFileUrl(form.photoPath);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
      <section className="card space-y-4">
        <div>
          <h2 className="section-title">Funcionarios e vinculos operacionais</h2>
          <p className="text-sm text-slate-500">Gestao completa com historico de EPI, checklist e manutencao.</p>
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
            placeholder="Matricula"
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

        {(actionMessage ||
          statusMutation.isError ||
          deleteMutation.isError ||
          enrollWithAgent.isError ||
          startBiometric.isError ||
          finishBiometric.isError ||
          deleteBiometric.isError) && (
          <div
            className={`rounded-xl p-3 text-sm ${
              statusMutation.isError ||
              deleteMutation.isError ||
              enrollWithAgent.isError ||
              startBiometric.isError ||
              finishBiometric.isError ||
              deleteBiometric.isError
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {deleteMutation.isError
              ? (deleteMutation.error as Error).message
              : statusMutation.isError
                ? (statusMutation.error as Error).message
                : enrollWithAgent.isError
                  ? `${(enrollWithAgent.error as Error).message}. Inicie o agente no Windows e tente novamente.`
                  : startBiometric.isError
                    ? (startBiometric.error as Error).message
                    : finishBiometric.isError
                      ? (finishBiometric.error as Error).message
                      : deleteBiometric.isError
                        ? (deleteBiometric.error as Error).message
                : actionMessage}
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
                <div className="flex items-start gap-2">
                  {employee.photoPath ? (
                    <img
                      src={getUploadedFileUrl(employee.photoPath) ?? ""}
                      alt={`Foto de ${employee.name}`}
                      className="h-16 w-12 rounded-md border border-slate-200 object-cover"
                    />
                  ) : null}
                  <span className={employee.isActive ? "badge-success" : "badge-neutral"}>
                    {employee.isActive ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => loadEmployee(employee)}>
                  Abrir ficha
                </button>
                <button
                  type="button"
                  className={employee.isActive ? "btn-danger" : "btn-primary"}
                  onClick={() => statusMutation.mutate({ id: employee.id, isActive: !employee.isActive })}
                >
                  {employee.isActive ? "Inativar" : "Ativar"}
                </button>
                {!employee.isActive && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      if (window.confirm(`Excluir o funcionario ${employee.name}?`)) {
                        deleteMutation.mutate(employee.id);
                      }
                    }}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{selectedEmployee ? "Ficha do funcionario" : "Novo funcionario"}</h2>
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
              placeholder="Matricula"
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
              placeholder="Funcao/cargo"
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
          <textarea
            className="textarea"
            rows={2}
            placeholder="Observacoes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">Foto 3x4 (opcional)</p>
            <div className="flex items-start gap-3">
              <div className="flex h-32 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
                {employeePhotoUrl ? (
                  <img
                    src={employeePhotoUrl}
                    alt="Preview da foto do funcionario"
                    className="h-32 w-24 rounded-md object-cover"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-slate-500">Sem foto</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreviewUrl(null);
                    setForm((prev) => ({ ...prev, photoPath: "" }));
                  }}
                >
                  Remover foto
                </button>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            Funcionario ativo
          </label>

          <button className="btn-primary w-full" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : selectedEmployee ? "Salvar alteracoes" : "Cadastrar funcionario"}
          </button>
        </form>

        {selectedEmployee && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="font-semibold">Biometria U.are.U 4500 (integracao via agente local)</h3>
            <p className="text-sm text-slate-600">Status: {biometricStatusLabel(selectedEmployee.biometric?.status)}</p>
            <div className="grid gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => enrollWithAgent.mutate(selectedEmployee.id)}
                disabled={enrollWithAgent.isPending || finishBiometric.isPending || startBiometric.isPending}
              >
                {enrollWithAgent.isPending ? "Lendo digital no agente..." : "Cadastrar biometria via agente Windows"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => startBiometric.mutate(selectedEmployee.id)}
                disabled={startBiometric.isPending || enrollWithAgent.isPending || finishBiometric.isPending}
              >
                {startBiometric.isPending ? "Iniciando vinculo..." : "Iniciar vinculo biometrico"}
              </button>
              <input
                className="input"
                placeholder="ID retornado pelo agente local"
                value={biometricExternalId}
                onChange={(event) => setBiometricExternalId(event.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => finishBiometric.mutate(selectedEmployee.id)}
                disabled={!biometricExternalId || finishBiometric.isPending || enrollWithAgent.isPending}
              >
                {finishBiometric.isPending ? "Confirmando biometria..." : "Confirmar biometria vinculada"}
              </button>
              <button type="button" className="btn-danger" onClick={() => deleteBiometric.mutate(selectedEmployee.id)}>
                Remover biometria
              </button>
            </div>
          </div>
        )}

        {employeeDetailsQuery.data && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="font-semibold">Historico operacional do funcionario</h3>
            <p className="text-sm text-slate-600">
              EPIs: {employeeDetailsQuery.data.epiMovements.length} | Checklists executados:{" "}
              {employeeDetailsQuery.data.checklistExecutions.length} | Ocorrencias/manutencoes relacionadas:{" "}
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
