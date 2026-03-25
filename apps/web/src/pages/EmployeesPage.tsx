import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, apiRequest, getUploadedFileUrl, uploadFile } from "../lib/api";
import { roleLabels } from "../lib/constants";
import { formatBrazilDate, toBrazilDateInputValue } from "../lib/datetime";
import type { UserRole } from "../lib/auth";

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
  admissionDate?: string | null;
  dismissalDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  user?: { id: string; email: string; role: UserRole; isActive: boolean } | null;
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
  admissionDate: "",
  dismissalDate: "",
  notes: "",
  isActive: true,
  canLogin: false,
  loginEmail: "",
  loginPassword: "",
  loginRole: "ALMOXARIFADO" as UserRole,
  loginIsActive: true
};

const occurrenceTypeLabels: Record<string, string> = {
  ATESTADO_MEDICO: "Atestado médico",
  FALTA: "Falta",
  ADVERTENCIA: "Advertência",
  OUTRO: "Outro"
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
  const [actionMessage, setActionMessage] = useState("");
  const [occurrenceForm, setOccurrenceForm] = useState({
    type: "OUTRO",
    date: toBrazilDateInputValue(),
    description: "",
    daysAway: "",
    notes: ""
  });
  const [occurrenceFile, setOccurrenceFile] = useState<File | null>(null);

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

  const createOccurrenceMutation = useMutation({
    mutationFn: async (payload: {
      employeeId: string;
      type: string;
      date: string;
      description: string;
      daysAway?: number | null;
      notes?: string | null;
    }) => {
      let attachmentPath: string | null = null;
      let attachmentMimeType: string | null = null;
      let attachmentFilename: string | null = null;

      if (occurrenceFile) {
        const uploaded = await uploadFile(occurrenceFile);
        attachmentPath = uploaded.path;
        attachmentMimeType = occurrenceFile.type || null;
        attachmentFilename = occurrenceFile.name || null;
      }

      return apiRequest(`/employees/${payload.employeeId}/occurrences`, {
        method: "POST",
        body: JSON.stringify({
          type: payload.type,
          date: payload.date,
          description: payload.description,
          daysAway: payload.daysAway ?? null,
          notes: payload.notes ?? null,
          attachmentPath,
          attachmentMimeType,
          attachmentFilename
        })
      });
    },
    onSuccess: async () => {
      setActionMessage("Ocorrencia registrada com sucesso.");
      setOccurrenceForm({
        type: "OUTRO",
        date: toBrazilDateInputValue(),
        description: "",
        daysAway: "",
        notes: ""
      });
      setOccurrenceFile(null);
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
  });

  const deleteOccurrenceMutation = useMutation({
    mutationFn: (payload: { employeeId: string; occurrenceId: string }) =>
      apiRequest(`/employees/${payload.employeeId}/occurrences/${payload.occurrenceId}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      setActionMessage("Ocorrencia removida com sucesso.");
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ["employee-details", selectedId] });
      }
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
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-details", employeeId] });
    }
  });

  const testIdentifyWithAgent = useMutation({
    mutationFn: async (employee: Employee) => {
      const token = localStorage.getItem("smartcheck.token");
      if (!token) {
        throw new Error("Sessao expirada. Faca login novamente.");
      }

      const response = await fetch(`${biometricAgentUrl}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl: API_URL,
          token,
          employeeId: employee.id
        })
      });

      const data = await response
        .json()
        .catch(() => ({ message: `Falha ao testar biometria (HTTP ${response.status})` }));
      if (!response.ok) {
        const message =
          data?.message ??
          data?.detail ??
          data?.title ??
          `Falha ao testar biometria (HTTP ${response.status})`;
        throw new Error(message);
      }

      return { expectedEmployee: employee, result: data as any };
    },
    onSuccess: ({ expectedEmployee, result }) => {
      const identifiedId =
        (result?.employee?.id as string | undefined) ??
        (result?.apiResponse?.employee?.id as string | undefined) ??
        (result?.employeeId as string | undefined);
      const identifiedName =
        (result?.employee?.name as string | undefined) ??
        (result?.apiResponse?.employee?.name as string | undefined);
      if (identifiedId && identifiedId === expectedEmployee.id) {
        setActionMessage(`Teste OK: digital reconheceu ${expectedEmployee.name}.`);
        return;
      }

      if (identifiedName) {
        setActionMessage(`Atencao: digital reconheceu ${identifiedName}, diferente de ${expectedEmployee.name}.`);
        return;
      }

      setActionMessage("Teste de biometria executado, mas sem identificacao valida.");
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
      admissionDate: employee.admissionDate ? employee.admissionDate.slice(0, 10) : "",
      dismissalDate: employee.dismissalDate ? employee.dismissalDate.slice(0, 10) : "",
      notes: employee.notes ?? "",
      isActive: employee.isActive,
      canLogin: Boolean(employee.user),
      loginEmail: employee.user?.email ?? "",
      loginPassword: "",
      loginRole: employee.user?.role ?? "ALMOXARIFADO",
      loginIsActive: employee.user?.isActive ?? true
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
      admissionDate: form.admissionDate || null,
      dismissalDate: form.dismissalDate || null,
      notes: form.notes || null,
      userAccess: form.canLogin
        ? {
            enabled: true,
            email: form.loginEmail,
            password: form.loginPassword || undefined,
            role: form.loginRole,
            isActive: form.loginIsActive
          }
        : {
            enabled: false
          }
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
          createOccurrenceMutation.isError ||
          deleteOccurrenceMutation.isError ||
          enrollWithAgent.isError ||
          deleteBiometric.isError ||
          testIdentifyWithAgent.isError) && (
          <div
            className={`rounded-xl p-3 text-sm ${
              statusMutation.isError ||
              deleteMutation.isError ||
              createOccurrenceMutation.isError ||
              deleteOccurrenceMutation.isError ||
              enrollWithAgent.isError ||
              deleteBiometric.isError ||
              testIdentifyWithAgent.isError
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {deleteMutation.isError
              ? (deleteMutation.error as Error).message
              : statusMutation.isError
                ? (statusMutation.error as Error).message
                : createOccurrenceMutation.isError
                  ? (createOccurrenceMutation.error as Error).message
                  : deleteOccurrenceMutation.isError
                    ? (deleteOccurrenceMutation.error as Error).message
                : enrollWithAgent.isError
                  ? `${(enrollWithAgent.error as Error).message}. Inicie o agente no Windows e tente novamente.`
                  : deleteBiometric.isError
                    ? (deleteBiometric.error as Error).message
                    : testIdentifyWithAgent.isError
                      ? (testIdentifyWithAgent.error as Error).message
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
                  className="btn-secondary"
                  onClick={() => loadEmployee(employee)}
                >
                  Ocorrencias
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
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Data de contratacao
              <input
                className="input mt-1"
                type="date"
                value={form.admissionDate}
                onChange={(event) => setForm({ ...form, admissionDate: event.target.value })}
              />
            </label>
            <label className="text-sm text-slate-600">
              Data de desligamento (opcional)
              <input
                className="input mt-1"
                type="date"
                value={form.dismissalDate}
                onChange={(event) => setForm({ ...form, dismissalDate: event.target.value })}
              />
            </label>
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

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.canLogin}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    canLogin: event.target.checked,
                    loginEmail: event.target.checked ? prev.loginEmail || prev.email : "",
                    loginPassword: ""
                  }))
                }
              />
              Pode acessar o sistema
            </label>

            {form.canLogin && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  type="email"
                  placeholder="E-mail de acesso"
                  value={form.loginEmail}
                  onChange={(event) => setForm({ ...form, loginEmail: event.target.value })}
                  required={form.canLogin}
                />
                <input
                  className="input"
                  type="password"
                  placeholder={
                    selectedEmployee?.user ? "Nova senha (opcional para manter)" : "Senha de acesso (min 6)"
                  }
                  value={form.loginPassword}
                  onChange={(event) => setForm({ ...form, loginPassword: event.target.value })}
                  required={form.canLogin && !selectedEmployee?.user}
                />
                <select
                  className="select"
                  value={form.loginRole}
                  onChange={(event) => setForm({ ...form, loginRole: event.target.value as UserRole })}
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.loginIsActive}
                    onChange={(event) => setForm({ ...form, loginIsActive: event.target.checked })}
                  />
                  Usuario ativo
                </label>
              </div>
            )}
          </div>

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
                disabled={
                  enrollWithAgent.isPending ||
                  testIdentifyWithAgent.isPending
                }
              >
                {enrollWithAgent.isPending ? "Lendo digital no agente..." : "Cadastrar biometria via agente Windows"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => testIdentifyWithAgent.mutate(selectedEmployee)}
                disabled={
                  testIdentifyWithAgent.isPending ||
                  enrollWithAgent.isPending ||
                  selectedEmployee.biometric?.status !== "CADASTRADA"
                }
              >
                {testIdentifyWithAgent.isPending ? "Testando reconhecimento..." : "Testar reconhecimento biometrico"}
              </button>
              <button type="button" className="btn-danger" onClick={() => deleteBiometric.mutate(selectedEmployee.id)}>
                Remover biometria
              </button>
            </div>
          </div>
        )}

        {selectedEmployee && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <h3 className="font-semibold">Ocorrencias do funcionario</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="select"
                value={occurrenceForm.type}
                onChange={(event) =>
                  setOccurrenceForm((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                <option value="ATESTADO_MEDICO">Atestado médico</option>
                <option value="FALTA">Falta</option>
                <option value="ADVERTENCIA">Advertência</option>
                <option value="OUTRO">Outro</option>
              </select>
              <input
                className="input"
                type="date"
                value={occurrenceForm.date}
                onChange={(event) =>
                  setOccurrenceForm((prev) => ({ ...prev, date: event.target.value }))
                }
              />
              <input
                className="input"
                type="number"
                min={0}
                placeholder="Dias afastado (opcional)"
                value={occurrenceForm.daysAway}
                onChange={(event) =>
                  setOccurrenceForm((prev) => ({ ...prev, daysAway: event.target.value }))
                }
              />
            </div>
            <input
              className="input"
              placeholder="Descricao da ocorrencia"
              value={occurrenceForm.description}
              onChange={(event) =>
                setOccurrenceForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
            <textarea
              className="textarea"
              rows={2}
              placeholder="Observacoes adicionais (opcional)"
              value={occurrenceForm.notes}
              onChange={(event) =>
                setOccurrenceForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
            <div className="space-y-2">
              <input
                className="input"
                type="file"
                accept="image/*,application/pdf,.pdf"
                onChange={(event) => setOccurrenceFile(event.target.files?.[0] ?? null)}
              />
              {occurrenceFile && (
                <p className="text-xs text-slate-600">Anexo selecionado: {occurrenceFile.name}</p>
              )}
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() =>
                createOccurrenceMutation.mutate({
                  employeeId: selectedEmployee.id,
                  type: occurrenceForm.type,
                  date: occurrenceForm.date,
                  description: occurrenceForm.description,
                  daysAway: occurrenceForm.daysAway ? Number(occurrenceForm.daysAway) : null,
                  notes: occurrenceForm.notes || null
                })
              }
              disabled={
                createOccurrenceMutation.isPending ||
                !occurrenceForm.description.trim() ||
                !occurrenceForm.date
              }
            >
              {createOccurrenceMutation.isPending ? "Registrando..." : "Registrar ocorrencia"}
            </button>

            <div className="space-y-2">
              {employeeDetailsQuery.data?.occurrences?.slice(0, 20).map((occurrence: any) => (
                <div key={occurrence.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {occurrenceTypeLabels[occurrence.type] ?? occurrence.type}
                      </p>
                      <p className="text-slate-600">
                        {formatBrazilDate(occurrence.date)}
                        {occurrence.daysAway ? ` • ${occurrence.daysAway} dia(s) afastado` : ""}
                      </p>
                      <p>{occurrence.description}</p>
                      {occurrence.notes ? <p className="text-slate-600">{occurrence.notes}</p> : null}
                      {occurrence.attachmentPath ? (
                        <div className="mt-2">
                          {String(occurrence.attachmentMimeType ?? "").startsWith("image/") ? (
                            <a
                              href={getUploadedFileUrl(occurrence.attachmentPath) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block"
                            >
                              <img
                                src={getUploadedFileUrl(occurrence.attachmentPath) ?? ""}
                                alt="Anexo da ocorrencia"
                                className="h-20 w-20 rounded-md border border-slate-200 object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={getUploadedFileUrl(occurrence.attachmentPath) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-cyan-700 underline"
                            >
                              Ver anexo PDF
                            </a>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        deleteOccurrenceMutation.mutate({
                          employeeId: selectedEmployee.id,
                          occurrenceId: occurrence.id
                        })
                      }
                      disabled={deleteOccurrenceMutation.isPending}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              ))}
              {!employeeDetailsQuery.data?.occurrences?.length && (
                <p className="text-sm text-slate-500">Nenhuma ocorrencia registrada.</p>
              )}
            </div>
          </div>
        )}

        {employeeDetailsQuery.data && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="font-semibold">Historico operacional do funcionario</h3>
            <p className="text-sm text-slate-600">
              EPIs: {employeeDetailsQuery.data.epiMovements.length} | Checklists executados:{" "}
              {employeeDetailsQuery.data.checklistExecutions.length} | Ocorrencias:{" "}
              {employeeDetailsQuery.data.occurrences?.length ?? 0} | Manutencoes relacionadas:{" "}
              {employeeDetailsQuery.data.relatedChecklistMaintenances.length}
            </p>
            <div className="space-y-2">
              {employeeDetailsQuery.data.epiMovements.slice(0, 5).map((item: any) => (
                <p key={item.id} className="text-sm">
                  EPI: {item.epi.name} | {item.movementType} | {formatBrazilDate(item.date)}
                </p>
              ))}
              {employeeDetailsQuery.data.checklistExecutions.slice(0, 5).map((item: any) => (
                <p key={item.id} className="text-sm">
                  Checklist: {item.template.name} ({item.equipment.name}) |{" "}
                  {formatBrazilDate(item.executedAt)}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
