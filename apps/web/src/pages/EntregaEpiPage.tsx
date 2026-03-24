import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";

const defaultPrintTerm =
  "Recebi da Empresa Acima, os EPI's abaixo relacionados, que sao fornecidos gratuitamente nos termos do Art 166 da C.L.T e item 6.2.1.2 da NR-6 da portaria 3.214 de 08/06/78, declaro ainda estar ciente que de acordo com art. 158, Paragrafo unico, letra \"b\" da CLT e item 6.3 da NR-6 da mesma portaria, que devo usar, obrigatoriamente estes EPI's durante toda jornada de trabalho, responsabilizar-me pela sua guarda e conservacao, comunicar ao Dep. De Pessoal, qualquer alteracao que os tornem danificados ou extraviados. Atesto ainda estar orientado e treinado da utilizacao correta destes EPI's abaixo relacionados.";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function EntregaEpiPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const biometricAgentUrl = import.meta.env.VITE_BIOMETRIC_AGENT_URL ?? "http://127.0.0.1:4100";
  const [actionMessage, setActionMessage] = useState("");
  const [isReadingFingerprint, setIsReadingFingerprint] = useState(false);
  const [printTerm, setPrintTerm] = useState(defaultPrintTerm);
  const [deliveryForm, setDeliveryForm] = useState({
    employeeId: "",
    epiId: "",
    movementType: "ENTREGA",
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    confirmationMethod: "BIOMETRIA",
    confirmationBiometricId: "",
    employeeSignatureName: ""
  });
  const [reportEmployeeId, setReportEmployeeId] = useState("");
  const [lastRegisteredDeliveryId, setLastRegisteredDeliveryId] = useState<string | null>(null);

  useEffect(() => {
    const savedTerm = localStorage.getItem("smartcheck.epi.printTerm");
    if (savedTerm) {
      setPrintTerm(savedTerm);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("smartcheck.epi.printTerm", printTerm);
  }, [printTerm]);

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => apiRequest<any[]>("/employees") });
  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<any[]>("/epis") });
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
      let responsibleBiometricId: string | null = null;

      if (!deliveryForm.employeeId) {
        throw new Error("Selecione o funcionario para validar a biometria.");
      }
      if (!user?.employee?.id) {
        throw new Error("Usuario logado sem vinculo com funcionario. Nao foi possivel validar biometria do responsavel.");
      }

      setIsReadingFingerprint(true);
      setActionMessage("Aguardando digital do funcionario que esta retirando o EPI...");
      const identifyEmployeeResult = await identifyEmployeeWithAgent(deliveryForm.employeeId);

      if (!identifyEmployeeResult.employeeId || identifyEmployeeResult.employeeId !== deliveryForm.employeeId) {
        throw new Error("A digital lida nao pertence ao funcionario selecionado.");
      }
      confirmationBiometricId =
        identifyEmployeeResult.biometricExternalId ?? identifyEmployeeResult.biometricRecordId ?? null;
      if (!confirmationBiometricId) {
        throw new Error("Biometria do funcionario validada, mas sem identificador retornado.");
      }

      setActionMessage("Agora confirme com a digital do responsavel pela entrega...");
      const identifyResponsibleResult = await identifyEmployeeWithAgent(user.employee.id);
      if (!identifyResponsibleResult.employeeId || identifyResponsibleResult.employeeId !== user.employee.id) {
        throw new Error("A digital lida nao pertence ao responsavel logado.");
      }
      responsibleBiometricId =
        identifyResponsibleResult.biometricExternalId ?? identifyResponsibleResult.biometricRecordId ?? null;
      if (!responsibleBiometricId) {
        throw new Error("Biometria do responsavel validada, mas sem identificador retornado.");
      }

      setIsReadingFingerprint(false);
      setDeliveryForm((prev) => ({ ...prev, confirmationBiometricId: confirmationBiometricId ?? "" }));
      setActionMessage("Biometrias validadas. Finalizando registro da entrega...");

      const biometricAuditNote = `[BIO_EMPLOYEE:${confirmationBiometricId}] [BIO_RESPONSIBLE:${responsibleBiometricId}]`;
      const movementNotes = deliveryForm.notes
        ? `${deliveryForm.notes}\n${biometricAuditNote}`
        : biometricAuditNote;

      const createdMovement = (await createMovement.mutateAsync({
        ...deliveryForm,
        confirmationMethod: "BIOMETRIA",
        quantity: Number(deliveryForm.quantity),
        employeeSignatureName: deliveryForm.employeeSignatureName || selectedEmployee?.name,
        confirmationBiometricId,
        notes: movementNotes
      })) as any;
      setLastRegisteredDeliveryId(createdMovement?.id ?? null);
    } catch (error) {
      setIsReadingFingerprint(false);
      setActionMessage((error as Error).message);
    }
  }

  function printEmployeeCopy(deliveryId?: string) {
    if (!reportQuery.data) return;

    const employee = reportQuery.data.employee;
    const deliveries = reportQuery.data.deliveries ?? [];
    const selectedById = deliveryId ? deliveries.find((item: any) => item.id === deliveryId) : undefined;
    const selectedLastRegistered = lastRegisteredDeliveryId
      ? deliveries.find((item: any) => item.id === lastRegisteredDeliveryId)
      : undefined;
    const targetDelivery =
      selectedById ??
      selectedLastRegistered ??
      deliveries.find((item: any) => item.movementType === "ENTREGA") ??
      deliveries[0];

    if (!targetDelivery) return;

    const rows = [targetDelivery]
      .map(
        (item: any) => `
          <tr>
            <td>${escapeHtml(item.epi?.name ?? "-")}</td>
            <td>${escapeHtml(item.epi?.ca ?? "-")}</td>
            <td>${escapeHtml(item.movementType ?? "-")}</td>
            <td>${escapeHtml(String(item.quantity ?? "-"))}</td>
            <td>${escapeHtml(new Date(item.date).toLocaleDateString("pt-BR"))}</td>
          </tr>
        `
      )
      .join("");
    const responsibleBioMatch = (targetDelivery?.notes ?? "").match(/\[BIO_RESPONSIBLE:([^\]]+)\]/);
    const employeeBioMatch = (targetDelivery?.notes ?? "").match(/\[BIO_EMPLOYEE:([^\]]+)\]/);
    const employeeBioId = employeeBioMatch?.[1] ?? targetDelivery?.confirmationBiometricId ?? "-";
    const responsibleBioId = responsibleBioMatch?.[1] ?? "-";
    const responsibleLabel =
      targetDelivery?.responsibleUser?.employee?.name ??
      targetDelivery?.responsibleUser?.email ??
      user?.employee?.name ??
      user?.email ??
      "-";
    const signedAt = targetDelivery?.employeeConfirmedAt
      ? new Date(targetDelivery.employeeConfirmedAt).toLocaleString("pt-BR")
      : "-";

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Ficha de entrega de EPI</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 12px 0; font-size: 20px; }
            p { margin: 6px 0; line-height: 1.45; }
            .term { margin: 16px 0; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
            .sign { margin-top: 28px; display: grid; gap: 12px; }
            .stamp { border: 1px solid #111827; border-radius: 8px; padding: 10px; }
            .stamp strong { display: block; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <h1>Ficha de entrega de EPI</h1>
          <p><strong>Funcionario:</strong> ${escapeHtml(employee.name ?? "-")}</p>
          <p><strong>Matricula:</strong> ${escapeHtml(employee.registration ?? "-")}</p>
          <p><strong>Setor:</strong> ${escapeHtml(employee.department ?? "-")} | <strong>Funcao:</strong> ${escapeHtml(employee.position ?? "-")}</p>
          <p><strong>Data da entrega:</strong> ${escapeHtml(new Date(targetDelivery.date).toLocaleString("pt-BR"))}</p>
          <div class="term">
            <p><strong>Termo:</strong> ${escapeHtml(printTerm)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>EPI</th>
                <th>CA</th>
                <th>Movimento</th>
                <th>Quantidade</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">Sem registros.</td></tr>'}
            </tbody>
          </table>
          <div class="sign">
            <div class="stamp">
              <strong>Assinatura do funcionario (biometria)</strong>
              ID biometria: ${escapeHtml(employeeBioId)}<br/>
              Confirmado em: ${escapeHtml(signedAt)}
            </div>
            <div class="stamp">
              <strong>Assinatura do responsavel (biometria)</strong>
              Usuario responsavel: ${escapeHtml(responsibleLabel)}<br/>
              ID biometria: ${escapeHtml(responsibleBioId)}
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
          Assinatura obrigatoria por biometria para funcionario e responsavel pela entrega.
        </div>
        <input
          className="input"
          placeholder="ID biometrico do funcionario (automatico)"
          value={deliveryForm.confirmationBiometricId}
          readOnly
          disabled
        />
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

      <div className="grid gap-4 xl:grid-cols-2">
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

        <section className="card space-y-3">
          <h2 className="section-title">Ficha individual de EPI</h2>
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Configurar termo de impressao
            </summary>
            <div className="mt-3 space-y-2">
              <textarea
                className="textarea"
                rows={7}
                value={printTerm}
                onChange={(e) => setPrintTerm(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Esse texto vai sair na copia impressa da ficha do funcionario.
              </p>
            </div>
          </details>
          <select
            className="select"
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
              <button type="button" className="btn-secondary" onClick={() => printEmployeeCopy()}>
                Imprimir copia da ultima entrega
              </button>
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
                    {item.responsibleUser?.employee?.name ?? item.responsibleUser?.email ?? "-"}
                  </p>
                  <p>
                    Confirmacao: {item.confirmationMethod} | Assinatura funcionario:{" "}
                    {item.employeeSignatureName}
                  </p>
                  <p className="text-slate-500">{new Date(item.date).toLocaleString("pt-BR")}</p>
                  <button
                    type="button"
                    className="btn-secondary mt-2"
                    onClick={() => printEmployeeCopy(item.id)}
                  >
                    Imprimir esta movimentacao
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
