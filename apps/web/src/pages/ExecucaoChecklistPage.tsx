import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBrazilMonthYearReference } from "../lib/datetime";
import {
  requiresHourmeter,
  requiresMileage,
  validateReadingForm,
  type ChecklistReadingMode
} from "../lib/checklistReadings";

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
  const [actionMessage, setActionMessage] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [monthReference, setMonthReference] = useState(getBrazilMonthYearReference());
  const [operatorName, setOperatorName] = useState(user?.employee?.name ?? "");
  const [secondaryOperatorName, setSecondaryOperatorName] = useState("");
  const [hourmeterValue, setHourmeterValue] = useState("");
  const [mileageValue, setMileageValue] = useState("");
  const [workingHoursStartMonth, setWorkingHoursStartMonth] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const templatesQuery = useQuery({
    queryKey: ["checklist-templates-exec", equipmentId],
    queryFn: () =>
      equipmentId
        ? apiRequest<any[]>(`/checklist-templates?equipmentId=${equipmentId}`)
        : Promise.resolve([])
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((template) => template.id === templateId),
    [templatesQuery.data, templateId]
  );
  const selectedEquipment = useMemo(
    () => equipmentsQuery.data?.find((equipment) => equipment.id === equipmentId),
    [equipmentsQuery.data, equipmentId]
  );

  useEffect(() => {
    if (!equipmentId) {
      setTemplateId("");
      return;
    }

    const firstTemplateId = templatesQuery.data?.[0]?.id ?? "";
    setTemplateId(firstTemplateId);
  }, [equipmentId, templatesQuery.data]);

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
      setActionMessage("Checklist registrado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["checklist-executions"] });
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["equipment-history"] });
      queryClient.invalidateQueries({ queryKey: ["equipments"] });
      setEquipmentId("");
      setTemplateId("");
      setItems({});
      setMonthReference(getBrazilMonthYearReference());
      setSecondaryOperatorName("");
      setHourmeterValue("");
      setMileageValue("");
      setWorkingHoursStartMonth("");
      setFuelLevel("");
      setNotes("");
      setValidationErrors([]);
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
  const readingMode = (selectedTemplate?.readingMode ?? "NONE") as ChecklistReadingMode;
  const showHourmeter = requiresHourmeter(readingMode);
  const showMileage = requiresMileage(readingMode);
  const requiresSecondOperator = templateCode === "EMPILHADEIRA_SEMANAL";
  const requiresWorkingHoursStart = templateCode === "PA_CARREGADEIRA";
  const requiresFuel = templateCode === "EMPILHADEIRA_SEMANAL";

  function submitExecution(event: FormEvent) {
    event.preventDefault();
    setActionMessage("");
    setValidationErrors([]);
    if (!user || !user.employee?.id || !selectedTemplate || !operatorName.trim()) {
      setValidationErrors(["Preencha o equipamento, o checklist e o operador responsavel."]);
      return;
    }

    const readingValidation = validateReadingForm(readingMode, hourmeterValue, mileageValue);
    if (readingValidation.errors.length > 0) {
      setValidationErrors(readingValidation.errors);
      return;
    }

    createExecution.mutate({
      templateId,
      equipmentId,
      employeeId: user.employee.id,
      monthReference,
      operatorName,
      secondaryOperatorName: secondaryOperatorName || null,
      hourmeterValue: readingValidation.hourmeterValue,
      mileageValue: readingValidation.mileageValue,
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
        <div className="grid gap-2">
          <select
            className="select"
            value={equipmentId}
            onChange={(e) => {
              setActionMessage("");
              setValidationErrors([]);
              setEquipmentId(e.target.value);
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
        </div>
        {equipmentId && !selectedTemplate && (
          <p className="text-sm text-amber-700">
            Este equipamento ainda não possui checklist vinculado.
          </p>
        )}
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
            Selecione um equipamento para preencher o formulario operacional.
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

            {(showHourmeter || showMileage || requiresFuel || requiresWorkingHoursStart) && (
              <div className="grid gap-2 md:grid-cols-3">
                {showHourmeter && (
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Horimetro atual</span>
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white pr-3 focus-within:border-blue-500">
                      <input
                        className="min-w-0 flex-1 rounded-xl border-0 px-3 py-2 outline-none"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={hourmeterValue}
                        onChange={(event) => setHourmeterValue(event.target.value)}
                        required
                      />
                      <span className="text-slate-500">h</span>
                    </div>
                    {selectedEquipment?.hourmeter != null && (
                      <span className="block text-xs font-normal text-slate-500">
                        Ultima leitura conhecida: {Number(selectedEquipment.hourmeter).toLocaleString("pt-BR")} h
                      </span>
                    )}
                  </label>
                )}
                {showMileage && (
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Quilometragem atual</span>
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white pr-3 focus-within:border-blue-500">
                      <input
                        className="min-w-0 flex-1 rounded-xl border-0 px-3 py-2 outline-none"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={mileageValue}
                        onChange={(event) => setMileageValue(event.target.value)}
                        required
                      />
                      <span className="text-slate-500">km</span>
                    </div>
                    {selectedEquipment?.mileage != null && (
                      <span className="block text-xs font-normal text-slate-500">
                        Ultima leitura conhecida: {Number(selectedEquipment.mileage).toLocaleString("pt-BR")} km
                      </span>
                    )}
                  </label>
                )}
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
            {validationErrors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                {validationErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
            {actionMessage && <p className="text-sm text-emerald-700">{actionMessage}</p>}
            {createExecution.isError && (
              <p className="text-sm text-red-700">{(createExecution.error as Error).message}</p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
