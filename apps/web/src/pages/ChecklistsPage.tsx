import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, uploadFile } from "../lib/api";
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
  if (code === "PRENSA_TUBOS_MANUAL_01") return "Checklist diário da Prensa Tubos Manual 01";
  if (code === "PRENSA_TUBOS_MANUAL_02") return "Checklist diário da Prensa Tubos Manual 02";
  if (code === "MISTURADOR_MASSA_TUBOS") return "Checklist diário do Misturador - Massa de Tubos";
  if (code === "PA_CARREGADEIRA") return "Checklist diário da Pá Carregadeira";
  if (code === "EMPILHADEIRA_SEMANAL") return "Checklist semanal da Empilhadeira";
  return "Checklist operacional";
}

function periodicityLabel(periodicity: string) {
  if (periodicity === "DIARIO") return "Diário";
  if (periodicity === "SEMANAL") return "Semanal";
  if (periodicity === "MENSAL") return "Mensal";
  return periodicity;
}

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [templateForm, setTemplateForm] = useState({
    name: "",
    code: "OUTRO" as ChecklistCode,
    periodicity: "DIARIO",
    equipmentId: "",
    description: "",
    items: [{ label: "", section: "Itens de inspeção" }]
  });
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
      const section = item.section || "Itens de inspeção";
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

  const createTemplate = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("/checklist-templates", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      setTemplateForm({
        name: "",
        code: "OUTRO",
        periodicity: "DIARIO",
        equipmentId: "",
        description: "",
        items: [{ label: "", section: "Itens de inspeção" }]
      });
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
    if (selectedTemplate?.code === "EMPILHADEIRA_SEMANAL") {
      return [
        { value: "OK", label: "N - Normal" },
        { value: "PROBLEMA", label: "A - Anormal" },
        { value: "NA", label: "NA" }
      ] as const;
    }
    return [
      { value: "OK", label: "OK" },
      { value: "SEM_USO", label: "I - sem uso" },
      { value: "PROBLEMA", label: "X - irregular" },
      { value: "NA", label: "N/A" }
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

  function submitTemplate(event: FormEvent) {
    event.preventDefault();
    createTemplate.mutate({
      name: templateForm.name,
      code: templateForm.code,
      periodicity: templateForm.periodicity,
      equipmentId: templateForm.equipmentId,
      description: templateForm.description || null,
      items: templateForm.items
        .filter((item) => item.label.trim())
        .map((item, index) => ({
          label: item.label,
          section: item.section || null,
          instruction: null,
          itemType: "OK_PROBLEMA_NA",
          position: index,
          required: true,
          requiresObservationOnProblem: true,
          allowsPhotoOnProblem: true,
          requiresPhotoOnProblem: false,
          opensMaintenanceOnProblem: true
        }))
    });
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">Cadastro de modelos de checklist</h2>
        <p className="text-sm text-slate-500">
          Se o sistema estiver limpo, cadastre primeiro o equipamento e depois monte aqui os itens que devem ser checados.
        </p>
        <form className="space-y-3" onSubmit={submitTemplate}>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="input"
              placeholder="Nome do checklist"
              value={templateForm.name}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <select
              className="select"
              value={templateForm.equipmentId}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
              required
            >
              <option value="">Vincular ao equipamento</option>
              {equipmentsQuery.data?.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="select"
              value={templateForm.periodicity}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, periodicity: event.target.value }))}
            >
              <option value="DIARIO">Diario</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
            <input className="input" value="Modelo livre" disabled />
          </div>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Descricao do formulario"
            value={templateForm.description}
            onChange={(event) => setTemplateForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <div className="space-y-2">
            {templateForm.items.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr,220px]">
                <input
                  className="input"
                  placeholder={`Item ${index + 1}`}
                  value={item.label}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      items: prev.items.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, label: event.target.value } : current
                      )
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Secao"
                  value={item.section}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      items: prev.items.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, section: event.target.value } : current
                      )
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setTemplateForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { label: "", section: "Itens de inspeção" }]
                }))
              }
            >
              Adicionar item
            </button>
            <button className="btn-primary" disabled={createTemplate.isPending || !equipmentsQuery.data?.length}>
              {createTemplate.isPending ? "Salvando modelo..." : "Salvar modelo de checklist"}
            </button>
          </div>
          {!equipmentsQuery.data?.length && (
            <p className="text-sm text-amber-700">
              Cadastre pelo menos um equipamento para criar um checklist.
            </p>
          )}
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Execução operacional de checklist</h2>
        <p className="text-sm text-slate-500">
          Aqui voce executa o checklist ja cadastrado. Se ainda nao existir, crie o modelo acima.
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
              Periodicidade: {periodicityLabel(selectedTemplate.periodicity)} | Regra crítica: marcação de
              irregularidade exige observação.
            </p>
          </div>
        )}
      </section>

      <form className="card space-y-3" onSubmit={submitExecution}>
        <h2 className="section-title">Formulário real digitalizado</h2>
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
                placeholder="Mês/Ano (MM/AAAA)"
                value={monthReference}
                onChange={(event) => setMonthReference(event.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Operador responsável"
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                required
              />
              {requiresSecondOperator && (
                <input
                  className="input"
                  placeholder="Operador 2 (quando aplicável)"
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
                  placeholder="Horímetro"
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
                    placeholder="Combustível"
                    value={fuelLevel}
                    onChange={(event) => setFuelLevel(event.target.value)}
                  />
                )}
                {requiresWorkingHoursStart && (
                  <input
                    className="input"
                    type="number"
                    placeholder="Hora trabalhada início do mês"
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
                                placeholder="Descrição do defeito/irregularidade (obrigatório)"
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
              placeholder="Descrição de defeitos encontrados / observações / manutenção realizada"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button className="btn-primary w-full py-3 text-base" disabled={createExecution.isPending}>
              {createExecution.isPending ? "Enviando checklist..." : "Finalizar checklist e registrar operação"}
            </button>
            {createExecution.isError && (
              <p className="text-sm text-red-700">{(createExecution.error as Error).message}</p>
            )}
          </>
        )}
      </form>

      <section className="card space-y-3">
        <h2 className="section-title">Histórico operacional do equipamento</h2>
        {!equipmentId && (
          <p className="text-sm text-slate-500">Selecione um equipamento para consultar o histórico operacional.</p>
        )}
        {equipmentHistoryQuery.data && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">Últimos checklists</h3>
                <div className="space-y-2">
                  {equipmentHistoryQuery.data.checklists.slice(0, 8).map((execution: any) => (
                    <div key={execution.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                      <p className="font-semibold">{execution.template.name}</p>
                      <p className="text-slate-600">{new Date(execution.executedAt).toLocaleString("pt-BR")}</p>
                      <p className={execution.hadProblem ? "text-red-700" : "text-emerald-700"}>
                        {execution.hadProblem ? "Com falha" : "Sem falha"}
                      </p>
                      {execution.items.length > 0 && (
                        <div className="mt-1">
                          {execution.items.map((item: any) => (
                            <p key={item.id} className="text-xs text-slate-700">
                              - {item.templateItem.label} ({item.attachments.length} foto(s))
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">Manutenções e preventivas</h3>
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
                        Próxima preventiva: {planAlert.alert.state} ({Number(planAlert.alert.currentValue).toFixed(1)} /{" "}
                        {Number(planAlert.alert.threshold).toFixed(1)})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
