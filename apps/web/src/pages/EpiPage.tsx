import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, apiRequest } from "../lib/api";

type Epi = {
  id: string;
  name: string;
  description?: string | null;
  ca: string;
  category: string;
  validityDate?: string | null;
  unit: string;
  stock: number;
  minimumStock: number;
  isActive: boolean;
};

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
  const biometricAgentUrl = import.meta.env.VITE_BIOMETRIC_AGENT_URL ?? "http://127.0.0.1:4100";
  const [epiForm, setEpiForm] = useState(epiFormInitial);
  const [editingEpiId, setEditingEpiId] = useState<string | null>(null);
  const [epiActionMessage, setEpiActionMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isReadingFingerprint, setIsReadingFingerprint] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    employeeId: "",
    epiId: "",
    movementType: "ENTREGA",
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    confirmationMethod: "LOGIN",
    confirmationBiometricId: "",
    employeeSignatureName: ""
  });
  const [reportEmployeeId, setReportEmployeeId] = useState("");

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => apiRequest<any[]>("/employees") });
  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<Epi[]>("/epis") });
  const movementsQuery = useQuery({
    queryKey: ["epi-deliveries"],
    queryFn: () => apiRequest<any[]>("/epi-deliveries")
  });

  const reportQuery = useQuery({
    queryKey: ["epi-report", reportEmployeeId],
    queryFn: () => apiRequest<any>(`/reports/epi-by-employee/${reportEmployeeId}`),
    enabled: Boolean(reportEmployeeId)
  });

  const selectedEmployee = useMemo(
    () => employeesQuery.data?.find((employee) => employee.id === deliveryForm.employeeId),
    [employeesQuery.data, deliveryForm.employeeId]
  );

  const createEpi = useMutation({
    mutationFn: (payload: any) => apiRequest("/epis", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setEpiActionMessage("EPI cadastrado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      setEpiForm(epiFormInitial);
    }
  });

  const updateEpi = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      apiRequest(`/epis/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setEpiActionMessage("EPI atualizado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      setEditingEpiId(null);
      setEpiForm(epiFormInitial);
    }
  });

  const deleteEpi = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string }>(`/epis/${id}`, {
        method: "DELETE"
      }),
    onSuccess: (_, deletedId) => {
      setEpiActionMessage("EPI apagado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      if (editingEpiId === deletedId) {
        setEditingEpiId(null);
        setEpiForm(epiFormInitial);
      }
    }
  });

  const createMovement = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("/epi-deliveries", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setActionMessage("Movimentacao registrada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["epi-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["epis"] });
      if (reportEmployeeId) queryClient.invalidateQueries({ queryKey: ["epi-report", reportEmployeeId] });
      setDeliveryForm((prev) => ({
        ...prev,
        quantity: 1,
        notes: "",
        confirmationBiometricId: "",
        employeeSignatureName: prev.employeeSignatureName || selectedEmployee?.name || ""
      }));
    }
  });

  function submitEpi(event: FormEvent) {
    event.preventDefault();
    setEpiActionMessage("");

    const payload = {
      ...epiForm,
      validityDate: epiForm.validityDate || null,
      stock: Number(epiForm.stock),
      minimumStock: Number(epiForm.minimumStock)
    };

    if (editingEpiId) {
      updateEpi.mutate({ id: editingEpiId, payload });
      return;
    }

    createEpi.mutate(payload);
  }

  function startEditEpi(epi: Epi) {
    setEpiActionMessage("");
    setEditingEpiId(epi.id);
    setEpiForm({
      name: epi.name ?? "",
      description: epi.description ?? "",
      ca: epi.ca ?? "",
      category: epi.category ?? "",
      validityDate: epi.validityDate ? new Date(epi.validityDate).toISOString().slice(0, 10) : "",
      unit: epi.unit ?? "UN",
      stock: Number(epi.stock ?? 0),
      minimumStock: Number(epi.minimumStock ?? 0),
      isActive: epi.isActive ?? true
    });
  }

  function cancelEditEpi() {
    setEditingEpiId(null);
    setEpiActionMessage("");
    setEpiForm(epiFormInitial);
  }

  function handleDeleteEpi(epi: Epi) {
    setEpiActionMessage("");
    const confirmed = window.confirm(`Confirma apagar o EPI "${epi.name}"?`);
    if (!confirmed) return;
    deleteEpi.mutate(epi.id);
  }

  async function identifyEmployeeWithAgent(employeeId: string) {
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
        employeeId
      })
    });

    const data = await response
      .json()
      .catch(() => ({ message: `Falha ao validar biometria (HTTP ${response.status})` }));
    if (!response.ok) {
      const message =
        data?.message ??
        data?.detail ??
        data?.title ??
        `Falha ao validar biometria (HTTP ${response.status})`;
      throw new Error(message);
    }

    return {
      employeeId:
        (data?.employeeId as string | undefined) ??
        (data?.employee?.id as string | undefined) ??
        (data?.apiResponse?.employee?.id as string | undefined),
      biometricExternalId:
        (data?.biometricExternalId as string | undefined) ??
        (data?.apiResponse?.biometric?.biometricExternalId as string | undefined) ??
        (data?.apiResponse?.biometricExternalId as string | undefined),
      biometricRecordId:
        (data?.apiResponse?.biometric?.id as string | undefined) ??
        (data?.biometricId as string | undefined)
    };
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    setActionMessage("");

    try {
      let confirmationBiometricId: string | null = null;

      if (deliveryForm.confirmationMethod === "BIOMETRIA") {
        if (!deliveryForm.employeeId) {
          throw new Error("Selecione o funcionario para validar a biometria.");
        }
        setIsReadingFingerprint(true);
        const identifyResult = await identifyEmployeeWithAgent(deliveryForm.employeeId);
        setIsReadingFingerprint(false);

        if (!identifyResult.employeeId || identifyResult.employeeId !== deliveryForm.employeeId) {
          throw new Error("A digital lida nao pertence ao funcionario selecionado.");
        }

        confirmationBiometricId =
          identifyResult.biometricExternalId ?? identifyResult.biometricRecordId ?? null;
        if (!confirmationBiometricId) {
          throw new Error("Biometria validada, mas sem identificador retornado pelo agente.");
        }

        setDeliveryForm((prev) => ({ ...prev, confirmationBiometricId: confirmationBiometricId ?? "" }));
        setActionMessage("Digital validada. Finalizando registro da entrega...");
      }

      await createMovement.mutateAsync({
        ...deliveryForm,
        quantity: Number(deliveryForm.quantity),
        employeeSignatureName: deliveryForm.employeeSignatureName || selectedEmployee?.name,
        confirmationBiometricId:
          deliveryForm.confirmationMethod === "BIOMETRIA" ? confirmationBiometricId : null
      });
    } catch (error) {
      setIsReadingFingerprint(false);
      setActionMessage((error as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={submitEpi} className="card space-y-2">
          <h2 className="section-title">{editingEpiId ? "Edicao de EPI" : "Cadastro de EPI"}</h2>
          <input
            className="input"
            placeholder="Nome"
            value={epiForm.name}
            onChange={(e) => setEpiForm({ ...epiForm, name: e.target.value })}
            required
          />
          <textarea
            className="textarea"
            placeholder="Descricao"
            value={epiForm.description}
            onChange={(e) => setEpiForm({ ...epiForm, description: e.target.value })}
            rows={2}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="CA"
              value={epiForm.ca}
              onChange={(e) => setEpiForm({ ...epiForm, ca: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Categoria"
              value={epiForm.category}
              onChange={(e) => setEpiForm({ ...epiForm, category: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input"
              placeholder="Unidade"
              value={epiForm.unit}
              onChange={(e) => setEpiForm({ ...epiForm, unit: e.target.value })}
              required
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Estoque"
              value={epiForm.stock}
              onChange={(e) => setEpiForm({ ...epiForm, stock: Number(e.target.value) })}
              required
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Estoque minimo"
              value={epiForm.minimumStock}
              onChange={(e) => setEpiForm({ ...epiForm, minimumStock: Number(e.target.value) })}
              required
            />
          </div>
          <input
            className="input"
            type="date"
            value={epiForm.validityDate}
            onChange={(e) => setEpiForm({ ...epiForm, validityDate: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-primary w-full" disabled={createEpi.isPending || updateEpi.isPending}>
              {createEpi.isPending || updateEpi.isPending
                ? "Salvando..."
                : editingEpiId
                  ? "Salvar alteracoes"
                  : "Cadastrar EPI"}
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={cancelEditEpi}
              disabled={!editingEpiId || createEpi.isPending || updateEpi.isPending}
            >
              Cancelar edicao
            </button>
          </div>
          {epiActionMessage && <p className="text-sm text-emerald-700">{epiActionMessage}</p>}
          {(createEpi.isError || updateEpi.isError || deleteEpi.isError) && (
            <p className="text-sm text-red-700">
              {(createEpi.error as Error)?.message ||
                (updateEpi.error as Error)?.message ||
                (deleteEpi.error as Error)?.message}
            </p>
          )}
        </form>

        <form onSubmit={submitMovement} className="card space-y-2">
          <h2 className="section-title">Ficha de entrega de EPI</h2>
          <select
            className="select"
            value={deliveryForm.employeeId}
            onChange={(e) =>
              setDeliveryForm({
                ...deliveryForm,
                employeeId: e.target.value,
                employeeSignatureName:
                  employeesQuery.data?.find((employee) => employee.id === e.target.value)?.name ?? ""
              })
            }
            required
          >
            <option value="">Funcionario</option>
            {employeesQuery.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.registration})
              </option>
            ))}
          </select>

          {selectedEmployee && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
              <p>
                Setor: <strong>{selectedEmployee.department}</strong> | Funcao:{" "}
                <strong>{selectedEmployee.position}</strong>
              </p>
            </div>
          )}

          <select
            className="select"
            value={deliveryForm.epiId}
            onChange={(e) => setDeliveryForm({ ...deliveryForm, epiId: e.target.value })}
            required
          >
            <option value="">EPI</option>
            {episQuery.data?.map((epi) => (
              <option key={epi.id} value={epi.id}>
                {epi.name} | CA {epi.ca}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="select"
              value={deliveryForm.movementType}
              onChange={(e) => setDeliveryForm({ ...deliveryForm, movementType: e.target.value })}
            >
              <option value="ENTREGA">Entrega</option>
              <option value="DEVOLUCAO">Devolucao</option>
            </select>
            <input
              className="input"
              type="number"
              min={1}
              value={deliveryForm.quantity}
              onChange={(e) => setDeliveryForm({ ...deliveryForm, quantity: Number(e.target.value) })}
              required
            />
          </div>
          <input
            className="input"
            type="date"
            value={deliveryForm.date}
            onChange={(e) => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
            required
          />
          <select
            className="select"
            value={deliveryForm.confirmationMethod}
            onChange={(e) =>
              setDeliveryForm({
                ...deliveryForm,
                confirmationMethod: e.target.value,
                confirmationBiometricId: ""
              })
            }
          >
            <option value="LOGIN">Assinatura digital do funcionario</option>
            <option value="BIOMETRIA">Confirmacao biometrica (agente local)</option>
          </select>
          {deliveryForm.confirmationMethod === "BIOMETRIA" && (
            <input
              className="input"
              placeholder="ID biometrico retornado pelo agente"
              value={deliveryForm.confirmationBiometricId}
              readOnly
              disabled
            />
          )}
          <input
            className="input"
            placeholder="Confirmacao do funcionario (nome)"
            value={deliveryForm.employeeSignatureName}
            onChange={(e) => setDeliveryForm({ ...deliveryForm, employeeSignatureName: e.target.value })}
            required
          />
          <textarea
            className="textarea"
            rows={2}
            placeholder="Observacao"
            value={deliveryForm.notes}
            onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
          />
          <button className="btn-primary w-full" disabled={createMovement.isPending || isReadingFingerprint}>
            {isReadingFingerprint
              ? "Lendo digital..."
              : createMovement.isPending
                ? "Salvando..."
                : "Registrar na ficha de EPI"}
          </button>
          {actionMessage && (
            <p className={`text-sm ${createMovement.isError ? "text-red-700" : "text-emerald-700"}`}>
              {actionMessage}
            </p>
          )}
          {createMovement.isError && (
            <p className="text-sm text-red-700">{(createMovement.error as Error).message}</p>
          )}
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">EPIs cadastrados</h2>
          <div className="space-y-2">
            {episQuery.data?.map((epi) => (
              <div key={epi.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{epi.name}</p>
                <p className="text-slate-500">
                  CA {epi.ca} | {epi.category}
                </p>
                <p>
                  Estoque: <strong>{epi.stock}</strong> ({epi.unit}) | Minimo: {epi.minimumStock}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => startEditEpi(epi)}
                    disabled={createEpi.isPending || updateEpi.isPending || deleteEpi.isPending}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDeleteEpi(epi)}
                    disabled={createEpi.isPending || updateEpi.isPending || deleteEpi.isPending}
                  >
                    {deleteEpi.isPending ? "Apagando..." : "Apagar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-title mb-3">Historico de movimentacoes</h2>
          <div className="space-y-2">
            {movementsQuery.data?.map((movement) => (
              <div key={movement.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">
                  {movement.employee.name} | {movement.epi.name}
                </p>
                <p>
                  {movement.movementType} | Quantidade: {movement.quantity} | Assinado por:{" "}
                  {movement.employeeSignatureName}
                </p>
                <p className="text-slate-500">{new Date(movement.date).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="section-title">Ficha individual de EPI</h2>
        <select
          className="select max-w-xl"
          value={reportEmployeeId}
          onChange={(e) => setReportEmployeeId(e.target.value)}
        >
          <option value="">Selecione um funcionario</option>
          {employeesQuery.data?.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>

        {reportQuery.data && (
          <div className="space-y-2 text-sm">
            <p>
              Funcionario: <strong>{reportQuery.data.employee.name}</strong> | Matricula:{" "}
              <strong>{reportQuery.data.employee.registration}</strong> | Setor:{" "}
              <strong>{reportQuery.data.employee.department}</strong> | Funcao:{" "}
              <strong>{reportQuery.data.employee.position}</strong>
            </p>
            <p>
              Admissao:{" "}
              <strong>
                {reportQuery.data.employee.admissionDate
                  ? new Date(reportQuery.data.employee.admissionDate).toLocaleDateString("pt-BR")
                  : "-"}
              </strong>
            </p>
            {reportQuery.data.deliveries.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold">
                  {item.epi.name} | CA {item.epi.ca}
                </p>
                <p>
                  {item.movementType} | Quantidade: {item.quantity} | Entregue por:{" "}
                  {item.responsibleUser?.email ?? "-"}
                </p>
                <p>
                  Confirmacao: {item.confirmationMethod} | Assinatura funcionario:{" "}
                  {item.employeeSignatureName}
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
