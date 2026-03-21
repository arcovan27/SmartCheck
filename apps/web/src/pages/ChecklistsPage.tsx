import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

type ItemState = {
  optionResult?: "OK" | "PROBLEMA" | "NA";
  booleanResult?: boolean;
  numericValue?: number;
  textValue?: string;
  observation?: string;
  attachmentIds: string[];
};

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    periodicity: "DIARIO",
    equipmentId: "",
    items: [{ label: "", itemType: "OK_PROBLEMA_NA" }]
  });
  const [equipmentId, setEquipmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Record<string, ItemState>>({});

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const templatesQuery = useQuery({
    queryKey: ["checklist-templates", equipmentId],
    queryFn: () =>
      apiRequest<any[]>(equipmentId ? `/checklist-templates?equipmentId=${equipmentId}` : "/checklist-templates")
  });
  const executionsQuery = useQuery({ queryKey: ["checklist-executions"], queryFn: () => apiRequest<any[]>("/checklist-executions") });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((template) => template.id === templateId),
    [templatesQuery.data, templateId]
  );

  const createTemplate = useMutation({
    mutationFn: (payload: any) => apiRequest("/checklist-templates", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      setTemplateForm({
        name: "",
        description: "",
        periodicity: "DIARIO",
        equipmentId: "",
        items: [{ label: "", itemType: "OK_PROBLEMA_NA" }]
      });
    }
  });

  const createExecution = useMutation({
    mutationFn: (payload: any) => apiRequest("/checklist-executions", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-executions"] });
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
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

  function submitTemplate(event: FormEvent) {
    event.preventDefault();
    createTemplate.mutate({
      ...templateForm,
      items: templateForm.items.map((item: any, index: number) => ({
        ...item,
        position: index,
        required: true,
        requiresObservationOnProblem: true,
        allowsPhotoOnProblem: true,
        opensMaintenanceOnProblem: true
      }))
    });
  }

  function submitExecution(event: FormEvent) {
    event.preventDefault();
    if (!user || !selectedTemplate) return;

    createExecution.mutate({
      templateId,
      equipmentId,
      employeeId: user.employee?.id,
      notes,
      items: selectedTemplate.items.map((item: any) => {
        const current = items[item.id] ?? { attachmentIds: [] };
        return {
          templateItemId: item.id,
          optionResult: current.optionResult,
          booleanResult: current.booleanResult,
          numericValue: current.numericValue,
          textValue: current.textValue,
          observation: current.observation,
          attachmentIds: current.attachmentIds
        };
      })
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <form className="card space-y-3" onSubmit={submitTemplate}>
          <h2 className="section-title">Modelo de checklist</h2>
          <input className="input" placeholder="Nome do modelo" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} required />
          <textarea className="textarea" placeholder="Descrição" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="select" value={templateForm.periodicity} onChange={(e) => setTemplateForm({ ...templateForm, periodicity: e.target.value })}>
              <option value="DIARIO">Diário</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
            <select className="select" value={templateForm.equipmentId} onChange={(e) => setTemplateForm({ ...templateForm, equipmentId: e.target.value })} required>
              <option value="">Equipamento</option>
              {equipmentsQuery.data?.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </select>
          </div>

          {templateForm.items.map((item: any, index: number) => (
            <div key={index} className="rounded-xl border border-slate-200 p-3">
              <input className="input mb-2" placeholder="Descrição do item" value={item.label} onChange={(e) => setTemplateForm((prev) => ({ ...prev, items: prev.items.map((it, itemIndex) => itemIndex === index ? { ...it, label: e.target.value } : it) }))} required />
              <select className="select" value={item.itemType} onChange={(e) => setTemplateForm((prev) => ({ ...prev, items: prev.items.map((it, itemIndex) => itemIndex === index ? { ...it, itemType: e.target.value } : it) }))}>
                <option value="OK_PROBLEMA_NA">OK / Problema / N/A</option>
                <option value="SIM_NAO">Sim / Não</option>
                <option value="NUMERO">Número</option>
                <option value="TEXTO">Texto</option>
              </select>
            </div>
          ))}

          <button type="button" className="btn-secondary w-full" onClick={() => setTemplateForm((prev) => ({ ...prev, items: [...prev.items, { label: "", itemType: "OK_PROBLEMA_NA" }] }))}>
            Adicionar item
          </button>
          <button className="btn-primary w-full" disabled={createTemplate.isPending}>{createTemplate.isPending ? "Salvando..." : "Salvar modelo"}</button>
        </form>

        <form className="card space-y-3" onSubmit={submitExecution}>
          <h2 className="section-title">Executar checklist</h2>
          <select className="select" value={equipmentId} onChange={(e) => { setEquipmentId(e.target.value); setTemplateId(""); setItems({}); }} required>
            <option value="">Selecione o equipamento</option>
            {equipmentsQuery.data?.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
            ))}
          </select>
          <select className="select" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setItems({}); }} required>
            <option value="">Selecione o modelo</option>
            {templatesQuery.data?.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>

          <div className="space-y-2">
            {selectedTemplate?.items.map((item: any) => {
              const state = items[item.id] ?? { attachmentIds: [] };
              const isProblem = state.optionResult === "PROBLEMA" || state.booleanResult === false;
              return (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 font-semibold">{item.label}</p>
                  {item.itemType === "OK_PROBLEMA_NA" && (
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" className={state.optionResult === "OK" ? "btn-primary" : "btn-secondary"} onClick={() => setItemValue(item.id, { optionResult: "OK" })}>OK</button>
                      <button type="button" className={state.optionResult === "PROBLEMA" ? "btn-danger" : "btn-secondary"} onClick={() => setItemValue(item.id, { optionResult: "PROBLEMA" })}>Problema</button>
                      <button type="button" className={state.optionResult === "NA" ? "btn-primary" : "btn-secondary"} onClick={() => setItemValue(item.id, { optionResult: "NA" })}>N/A</button>
                    </div>
                  )}
                  {item.itemType === "SIM_NAO" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className={state.booleanResult === true ? "btn-primary" : "btn-secondary"} onClick={() => setItemValue(item.id, { booleanResult: true })}>Sim</button>
                      <button type="button" className={state.booleanResult === false ? "btn-danger" : "btn-secondary"} onClick={() => setItemValue(item.id, { booleanResult: false })}>Não</button>
                    </div>
                  )}
                  {item.itemType === "NUMERO" && (
                    <input className="input" type="number" onChange={(e) => setItemValue(item.id, { numericValue: Number(e.target.value) })} />
                  )}
                  {item.itemType === "TEXTO" && (
                    <textarea className="textarea" rows={2} onChange={(e) => setItemValue(item.id, { textValue: e.target.value })} />
                  )}

                  {isProblem && (
                    <div className="mt-2 space-y-2 rounded-xl bg-red-50 p-2">
                      <textarea className="textarea" rows={2} placeholder="Observação obrigatória" value={state.observation ?? ""} onChange={(e) => setItemValue(item.id, { observation: e.target.value })} required />
                      <input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => attachPhoto(item.id, e.target.files?.[0])} />
                      <p className="text-xs text-slate-600">Fotos anexadas: {state.attachmentIds.length}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <textarea className="textarea" rows={2} placeholder="Observações gerais" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn-primary w-full" disabled={createExecution.isPending || !selectedTemplate}>{createExecution.isPending ? "Enviando..." : "Finalizar checklist"}</button>
          {createExecution.isError && <p className="text-sm text-red-700">{(createExecution.error as Error).message}</p>}
        </form>
      </div>

      <section className="card">
        <h2 className="section-title mb-3">Histórico de execuções</h2>
        <div className="space-y-2">
          {executionsQuery.data?.map((execution) => (
            <div key={execution.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">
                {execution.equipment.name} • {execution.template.name}
              </p>
              <p className="text-slate-500">{new Date(execution.executedAt).toLocaleString("pt-BR")}</p>
              <span className={execution.hadProblem ? "badge-danger" : "badge-success"}>
                {execution.hadProblem ? "Com problema" : "Sem problema"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
