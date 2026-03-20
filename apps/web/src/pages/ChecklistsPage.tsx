import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

type ChecklistItemState = {
  result?: "OK" | "PROBLEM" | "NA" | "YES" | "NO";
  numericValue?: number;
  textValue?: string;
  problemDescription?: string;
  attachmentIds: string[];
};

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [equipmentId, setEquipmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Record<string, ChecklistItemState>>({});
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const templatesQuery = useQuery({
    queryKey: ["checklist-templates", equipmentId],
    queryFn: () => apiRequest<any[]>(equipmentId ? `/checklist-templates?equipmentId=${equipmentId}` : "/checklist-templates")
  });
  const executionsQuery = useQuery({ queryKey: ["checklist-executions"], queryFn: () => apiRequest<any[]>("/checklist-executions") });

  const selectedTemplate = useMemo(() => templatesQuery.data?.find((template) => template.id === templateId), [templatesQuery.data, templateId]);

  const createExecution = useMutation({
    mutationFn: (payload: any) => apiRequest("/checklist-executions", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-executions"] });
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      setNotes("");
      setItems({});
    }
  });

  function updateItem(itemId: string, patch: Partial<ChecklistItemState>) {
    setItems((prev) => {
      const previousState = prev[itemId] ?? { attachmentIds: [] };
      return {
        ...prev,
        [itemId]: {
          ...previousState,
          ...patch,
          attachmentIds: patch.attachmentIds ?? previousState.attachmentIds
        }
      };
    });
  }

  async function onFileSelect(itemId: string, file?: File | null) {
    if (!file) {
      return;
    }

    setUploadingItemId(itemId);
    try {
      const uploaded = await uploadFile(file);
      const current = items[itemId]?.attachmentIds ?? [];
      updateItem(itemId, { attachmentIds: [...current, uploaded.id] });
    } finally {
      setUploadingItemId(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedTemplate || !user) {
      return;
    }

    const payloadItems = selectedTemplate.items.map((templateItem: any) => {
      const value = items[templateItem.id] ?? { attachmentIds: [] };
      return {
        templateItemId: templateItem.id,
        result: value.result,
        numericValue: value.numericValue,
        textValue: value.textValue,
        problemDescription: value.problemDescription,
        attachmentIds: value.attachmentIds
      };
    });

    createExecution.mutate({
      templateId,
      equipmentId,
      operatorId: user.employee.id,
      notes,
      items: payloadItems
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr,1fr]">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="text-lg font-bold">Executar Checklist</h2>
        <select className="input" value={equipmentId} onChange={(event) => { setEquipmentId(event.target.value); setTemplateId(""); setItems({}); }} required>
          <option value="">Selecione o equipamento</option>
          {equipmentsQuery.data?.filter((equipment) => equipment.active).map((equipment) => <option value={equipment.id} key={equipment.id}>{equipment.name}</option>)}
        </select>
        <select className="input" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setItems({}); }} required>
          <option value="">Selecione o modelo</option>
          {templatesQuery.data?.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
        </select>

        <div className="space-y-3">
          {selectedTemplate?.items.map((item: any) => {
            const state = items[item.id] ?? { attachmentIds: [] };
            const isProblem = state.result === "PROBLEM" || state.result === "NO";
            return (
              <div key={item.id} className="rounded-xl border border-slate-300 p-3">
                <p className="font-semibold text-sm">{item.position + 1}. {item.label}</p>
                {item.responseType === "OK_PROBLEM_NA" && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { value: "OK", label: "OK", cls: "bg-emerald-600" },
                      { value: "PROBLEM", label: "Problema", cls: "bg-red-600" },
                      { value: "NA", label: "N/A", cls: "bg-slate-600" }
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`rounded-xl px-3 py-3 text-sm font-bold text-white ${state.result === option.value ? option.cls : "bg-slate-300 text-slate-800"}`}
                        onClick={() => updateItem(item.id, { result: option.value as ChecklistItemState["result"] })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {item.responseType === "YES_NO" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      { value: "YES", label: "Sim", cls: "bg-emerald-600" },
                      { value: "NO", label: "Não", cls: "bg-red-600" }
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`rounded-xl px-3 py-3 text-sm font-bold text-white ${state.result === option.value ? option.cls : "bg-slate-300 text-slate-800"}`}
                        onClick={() => updateItem(item.id, { result: option.value as ChecklistItemState["result"] })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {item.responseType === "NUMBER" && (
                  <input className="input mt-2" type="number" value={state.numericValue ?? ""} onChange={(event) => updateItem(item.id, { numericValue: Number(event.target.value) })} />
                )}
                {item.responseType === "TEXT" && (
                  <textarea className="input mt-2" value={state.textValue ?? ""} onChange={(event) => updateItem(item.id, { textValue: event.target.value })} rows={3} />
                )}

                {isProblem && (
                  <div className="mt-2 space-y-2 rounded-lg bg-red-50 p-2">
                    <textarea
                      className="input"
                      placeholder="Descrição obrigatória do problema"
                      value={state.problemDescription ?? ""}
                      onChange={(event) => updateItem(item.id, { problemDescription: event.target.value })}
                      rows={2}
                      required
                    />
                    <label className="block text-sm font-medium text-red-700">
                      Foto obrigatória (câmera)
                      <input
                        className="input mt-1"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) => onFileSelect(item.id, event.target.files?.[0])}
                      />
                    </label>
                    <p className="text-xs text-red-700">Fotos anexadas: {state.attachmentIds.length}</p>
                    {uploadingItemId === item.id && <p className="text-xs text-slate-600">Enviando foto...</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <textarea className="input" placeholder="Observações gerais" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        <button className="btn-primary w-full py-4 text-base" disabled={createExecution.isPending || !selectedTemplate}>
          {createExecution.isPending ? "Enviando..." : "Finalizar Checklist"}
        </button>
        {createExecution.isError && <p className="text-sm text-red-600">{(createExecution.error as Error).message}</p>}
      </form>

      <section className="card space-y-2">
        <h2 className="text-lg font-bold">Histórico de Checklists</h2>
        {executionsQuery.data?.map((execution) => (
          <div key={execution.id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{execution.equipment.name}</p>
            <p>{execution.template.name}</p>
            <p>{new Date(execution.executedAt).toLocaleString("pt-BR")}</p>
            <p className={execution.hadProblem ? "text-red-700 font-semibold" : "text-emerald-700"}>
              {execution.hadProblem ? "Com problema" : "Sem problema"}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
