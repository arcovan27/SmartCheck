import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getUploadedFileUrl, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

type ChecklistCode =
  | "PRENSA_TUBOS_MANUAL_01"
  | "PRENSA_TUBOS_MANUAL_02"
  | "MISTURADOR_MASSA_TUBOS"
  | "PA_CARREGADEIRA"
  | "EMPILHADEIRA_SEMANAL"
  | "OUTRO";

type ItemState = {
  optionResult?: "OK" | "SEM_USO" | "PROBLEMA" | "NA";
  observation?: string;
  attachmentIds: string[];
};

function codeDescription(code: ChecklistCode) {
  if (code === "PRENSA_TUBOS_MANUAL_01") return "Checklist diario da Prensa Tubos Manual 01";
  if (code === "PRENSA_TUBOS_MANUAL_02") return "Checklist diario da Prensa Tubos Manual 02";
  if (code === "MISTURADOR_MASSA_TUBOS") return "Checklist diario do Misturador - Massa de Tubos";
  if (code === "PA_CARREGADEIRA") return "Checklist diario da Pa Carregadeira";
  if (code === "EMPILHADEIRA_SEMANAL") return "Checklist semanal da Empilhadeira";
  return "Checklist operacional";
}

function periodicityLabel(periodicity: string) {
  if (periodicity === "DIARIO") return "Diario";
  if (periodicity === "SEMANAL") return "Semanal";
  if (periodicity === "MENSAL") return "Mensal";
  return periodicity;
}

export function ExecucaoChecklistPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [equipmentId, setEquipmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [monthReference, setMonthReference] = useState(
    `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`
  );
  const [operatorName, setOperatorName] = useState(user?.employee?.name ?? "");
  const [secondaryOperatorName, setSecondaryOperatorName] = useState("");
  const [hourmeterValue, setHourmeterValue] = useState("");
  const [mileageValue, setMileageValue] = useState("");
  const [workingHoursStartMonth, setWorkingHoursStartMonth] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [openedHistoryDetails, setOpenedHistoryDetails] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const templatesQuery = useQuery({
    queryKey: ["checklist-templates", equipmentId],
    queryFn: () =>
      apiRequest<any[]>(
        equipmentId ? `/checklist-templates?equipmentId=${equipmentId}` : "/checklist-templates"
      )
  });
  const equipmentHistoryQuery = useQuery({
    queryKey: ["equipment-history", equipmentId],
    queryFn: () => apiRequest<any>(`/history/equipment/${equipmentId}`),
    enabled: Boolean(equipmentId)
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((template) => template.id === templateId),
    [templatesQuery.data, templateId]
  );

  const groupedItems = useMemo(() => {
    if (!selectedTemplate) return [];
    const map = new Map<string, any[]>();
    selectedTemplate.items.forEach((item: any) => {
      const section = item.section || "Itens de inspecao";
      const current = map.get(section) ?? [];
      current.push(item);
      map.set(section, current);
    });
    return Array.from(map.entries());
  }, [selectedTemplate]);

  const createExecution = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("/checklist-executions", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-executions"] });
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["equipment-history"] });
      setItems({});
      setNotes("");
    }
  });

  function setItemValue(itemId: string, patch: Partial<ItemState>) {
    setItems((prev) => {
      const current = prev[itemId] ?? { attachmentIds: [] };
      return {
        ...prev,
        [itemId]: {
          ...current,
          ...patch,
          attachmentIds: patch.attachmentIds ?? current.attachmentIds
        }
      };
    });
  }

  async function attachPhoto(itemId: string, file?: File | null) {
    if (!file) return;
    const upload = await uploadFile(file);
    const current = items[itemId]?.attachmentIds ?? [];
    setItemValue(itemId, { attachmentIds: [...current, upload.id] });
  }

  function optionLabels() {
    return [
      { value: "OK", label: "OK" },
      { value: "SEM_USO", label: "Sem Uso" },
      { value: "PROBLEMA", label: "Irregular" },
      { value: "NA", label: "Nao se aplica" }
    ] as const;
  }

  const templateCode = selectedTemplate?.code as ChecklistCode | undefined;
  const requiresVehicleHeader = templateCode === "PA_CARREGADEIRA" || templateCode === "EMPILHADEIRA_SEMANAL";
  const requiresSecondOperator = templateCode === "EMPILHADEIRA_SEMANAL";
  const requiresWorkingHoursStart = templateCode === "PA_CARREGADEIRA";
  const requiresFuel = templateCode === "EMPILHADEIRA_SEMANAL";

  function submitExecution(event: FormEvent) {
    event.preventDefault();
    if (!user || !user.employee?.id || !selectedTemplate || !operatorName.trim()) return;

    createExecution.mutate({
      templateId,
      equipmentId,
      employeeId: user.employee.id,
      monthReference,
      operatorName,
      secondaryOperatorName: secondaryOperatorName || null,
      hourmeterValue: hourmeterValue ? Number(hourmeterValue) : null,
      mileageValue: mileageValue ? Number(mileageValue) : null,
      workingHoursStartMonth: workingHoursStartMonth ? Number(workingHoursStartMonth) : null,
      fuelLevel: fuelLevel || null,
      notes,
      items: selectedTemplate.items.map((item: any) => {
        const current = items[item.id] ?? { attachmentIds: [] };
        return {
          templateItemId: item.id,
          optionResult: current.optionResult,
          observation: current.observation,
          attachmentIds: current.attachmentIds
        };
      })
    });
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">Execucao operacional de checklist</h2>
        <p className="text-sm text-slate-500">
          Aqui voce executa o checklist ja cadastrado. Se ainda nao existir, crie o modelo no menu de cadastro.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="select"
            value={equipmentId}
            onChange={(e) => {
              setEquipmentId(e.target.value);
              setTemplateId("");
              setItems({});
            }}
            required
          >
            <option value="">Selecione o equipamento</option>
            {equipmentsQuery.data?.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>
                {equipment.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setItems({});
            }}
            required
          >
            <option value="">Selecione o checklist</option>
            {templatesQuery.data?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        {selectedTemplate && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold">{codeDescription(selectedTemplate.code)}</p>
            <p className="text-slate-600">
              Periodicidade: {periodicityLabel(selectedTemplate.periodicity)} | Regra critica: marcacao de
              irregularidade exige observacao.
            </p>
          </div>
        )}
      </section>

      <form className="card space-y-3" onSubmit={submitExecution}>
        <h2 className="section-title">Formulario real digitalizado</h2>
        {!selectedTemplate && (
          <p className="text-sm text-slate-500">
            Selecione um equipamento e um checklist para preencher o formulario operacional.
          </p>
        )}

        {selectedTemplate && (
          <>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                className="input"
                placeholder="Mes/Ano (MM/AAAA)"
                value={monthReference}
                onChange={(event) => setMonthReference(event.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Operador responsavel"
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                required
              />
              {requiresSecondOperator && (
                <input
                  className="input"
                  placeholder="Operador 2 (quando aplicavel)"
                  value={secondaryOperatorName}
                  onChange={(event) => setSecondaryOperatorName(event.target.value)}
                />
              )}
            </div>

            {requiresVehicleHeader && (
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  className="input"
                  type="number"
                  placeholder="Horimetro"
                  value={hourmeterValue}
                  onChange={(event) => setHourmeterValue(event.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="KM"
                  value={mileageValue}
                  onChange={(event) => setMileageValue(event.target.value)}
                />
                {requiresFuel && (
                  <input
                    className="input"
                    placeholder="Combustivel"
                    value={fuelLevel}
                    onChange={(event) => setFuelLevel(event.target.value)}
                  />
                )}
                {requiresWorkingHoursStart && (
                  <input
                    className="input"
                    type="number"
                    placeholder="Hora trabalhada inicio do mes"
                    value={workingHoursStartMonth}
                    onChange={(event) => setWorkingHoursStartMonth(event.target.value)}
                  />
                )}
              </div>
            )}

            <div className="space-y-3">
              {groupedItems.map(([section, sectionItems]) => (
                <section key={section} className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-3 text-base font-bold text-slate-800">{section}</h3>
                  <div className="space-y-3">
                    {sectionItems.map((item: any) => {
                      const state = items[item.id] ?? { attachmentIds: [] };
                      const isProblem = state.optionResult === "PROBLEMA";
                      return (
                        <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                          <p className="mb-2 font-semibold">{item.label}</p>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {optionLabels().map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={
                                  state.optionResult === option.value
                                    ? option.value === "PROBLEMA"
                                      ? "btn-danger"
                                      : "btn-primary"
                                    : "btn-secondary"
                                }
                                onClick={() =>
                                  setItemValue(item.id, { optionResult: option.value as ItemState["optionResult"] })
                                }
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {isProblem && (
                            <div className="mt-2 space-y-2 rounded-xl bg-red-50 p-2">
                              <textarea
                                className="textarea"
                                rows={2}
                                placeholder="Descricao do defeito/irregularidade (obrigatorio)"
                                value={state.observation ?? ""}
                                onChange={(e) => setItemValue(item.id, { observation: e.target.value })}
                                required
                              />
                              <input
                                className="input"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => attachPhoto(item.id, e.target.files?.[0])}
                              />
                              <p className="text-xs text-slate-600">
                                Fotos anexadas: {state.attachmentIds.length}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <textarea
              className="textarea"
              rows={3}
              placeholder="Descricao de defeitos encontrados / observacoes / manutencao realizada"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button className="btn-primary w-full py-3 text-base" disabled={createExecution.isPending}>
              {createExecution.isPending ? "Enviando checklist..." : "Finalizar checklist e registrar operacao"}
            </button>
            {createExecution.isError && (
              <p className="text-sm text-red-700">{(createExecution.error as Error).message}</p>
            )}
          </>
        )}
      </form>

      <section className="card space-y-3">
        <h2 className="section-title">Historico operacional do equipamento</h2>
        {!equipmentId && (
          <p className="text-sm text-slate-500">Selecione um equipamento para consultar o historico operacional.</p>
        )}
        {equipmentHistoryQuery.data && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-semibold">Ultimos checklists</h3>
              <div className="space-y-2">
                {equipmentHistoryQuery.data.checklists.slice(0, 8).map((execution: any) => (
                  <div key={execution.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{execution.template.name}</p>
                    <p className="text-slate-600">{new Date(execution.executedAt).toLocaleString("pt-BR")}</p>
                    <p className={execution.hadProblem ? "text-red-700" : "text-emerald-700"}>
                      {execution.hadProblem ? "Com falha" : "Sem falha"}
                    </p>
                    {execution.hadProblem && execution.items?.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setOpenedHistoryDetails((prev) => ({
                              ...prev,
                              [execution.id]: !prev[execution.id]
                            }))
                          }
                        >
                          {openedHistoryDetails[execution.id] ? "Ocultar falhas" : "Ver falhas"}
                        </button>

                        {openedHistoryDetails[execution.id] && (
                          <div className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-2">
                            {execution.items.map((problemItem: any) => (
                              <div key={problemItem.id} className="rounded-lg border border-red-200 bg-white p-2">
                                <p className="font-semibold text-red-800">{problemItem.templateItem?.label ?? "Item"}</p>
                                <p className="text-sm text-slate-700">
                                  Observacao: {problemItem.observation?.trim() ? problemItem.observation : "-"}
                                </p>
                                {problemItem.attachments?.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {problemItem.attachments.map((attachment: any) => {
                                      const imageUrl = getUploadedFileUrl(attachment.path);
                                      if (!imageUrl) return null;
                                      return (
                                        <button
                                          key={attachment.id}
                                          className="block"
                                          type="button"
                                          onClick={() => setPreviewImageUrl(imageUrl)}
                                        >
                                          <img
                                            src={imageUrl}
                                            alt="Foto da falha"
                                            className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-semibold">Manutencoes e preventivas</h3>
              <div className="space-y-2">
                {equipmentHistoryQuery.data.maintenances.slice(0, 8).map((maintenance: any) => (
                  <div key={maintenance.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{maintenance.description}</p>
                    <p className="text-slate-600">
                      {maintenance.type} | {maintenance.status}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {equipmentHistoryQuery.data.planAlerts.map((planAlert: any) => (
                  <div key={planAlert.plan.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                    <p className="font-semibold">{planAlert.plan.title}</p>
                    <p>
                      Proxima preventiva: {planAlert.alert.state} ({Number(planAlert.alert.currentValue).toFixed(1)} /{" "}
                      {Number(planAlert.alert.threshold).toFixed(1)})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative">
            <button
              type="button"
              className="btn-danger absolute -right-2 -top-2 z-10"
              onClick={() => setPreviewImageUrl(null)}
            >
              Fechar
            </button>
            <img
              src={previewImageUrl}
              alt="Visualizacao da falha"
              className="max-h-[90vh] max-w-[90vw] rounded-lg border border-slate-200 bg-white object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
