import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

type TemplateItem = {
  id?: string;
  label: string;
  section: string;
};

const emptyForm = {
  name: "",
  code: "OUTRO" as const,
  periodicity: "DIARIO",
  equipmentId: "",
  description: "",
  items: [{ label: "", section: "Itens de inspecao" }] as TemplateItem[]
};

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });
  const templatesQuery = useQuery({
    queryKey: ["checklist-templates-models"],
    queryFn: () => apiRequest<any[]>("/checklist-templates")
  });

  const saveTemplate = useMutation({
    mutationFn: (payload: any) => {
      if (editingTemplateId) {
        return apiRequest(`/checklist-templates/${editingTemplateId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      }
      return apiRequest("/checklist-templates", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      setMessage(editingTemplateId ? "Modelo atualizado com sucesso." : "Modelo cadastrado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      queryClient.invalidateQueries({ queryKey: ["checklist-templates-models"] });
      setEditingTemplateId(null);
      setForm(emptyForm);
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string }>(`/checklist-templates/${id}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      setMessage("Modelo apagado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      queryClient.invalidateQueries({ queryKey: ["checklist-templates-models"] });
    }
  });

  function submitTemplate(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const validItems = form.items.filter((item) => item.label.trim());
    if (validItems.length === 0) {
      setMessage("Adicione pelo menos um item no modelo.");
      return;
    }
    saveTemplate.mutate({
      name: form.name,
      code: "OUTRO",
      periodicity: form.periodicity,
      equipmentId: form.equipmentId,
      description: form.description || null,
      items: validItems
        .map((item, index) => ({
          id: item.id,
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

  function startEdit(template: any) {
    setMessage("");
    setEditingTemplateId(template.id);
    setForm({
      name: template.name ?? "",
      code: "OUTRO",
      periodicity: template.periodicity ?? "DIARIO",
      equipmentId: template.equipmentId ?? "",
      description: template.description ?? "",
      items:
        template.items?.length > 0
          ? template.items.map((item: any) => ({
              id: item.id,
              label: item.label ?? "",
              section: item.section ?? "Itens de inspecao"
            }))
          : [{ label: "", section: "Itens de inspecao" }]
    });
  }

  function cancelEdit() {
    setEditingTemplateId(null);
    setMessage("");
    setForm(emptyForm);
  }

  function removeTemplate(template: any) {
    const confirmed = window.confirm(`Confirma apagar o modelo "${template.name}"?`);
    if (!confirmed) return;
    setMessage("");
    deleteTemplate.mutate(template.id);
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">{editingTemplateId ? "Editar modelo de checklist" : "Cadastro de modelos de checklist"}</h2>
        <p className="text-sm text-slate-500">
          Aqui voce define apenas os modelos. A execucao operacional fica no menu "Execucao de Checklist".
        </p>
        <form className="space-y-3" onSubmit={submitTemplate}>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="input"
              placeholder="Nome do checklist"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <select
              className="select"
              value={form.equipmentId}
              onChange={(event) => setForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
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
              value={form.periodicity}
              onChange={(event) => setForm((prev) => ({ ...prev, periodicity: event.target.value }))}
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
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <div className="space-y-2">
            {form.items.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr,220px,140px]"
              >
                <input
                  className="input"
                  placeholder={`Item ${index + 1}`}
                  value={item.label}
                  onChange={(event) =>
                    setForm((prev) => ({
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
                    setForm((prev) => ({
                      ...prev,
                      items: prev.items.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, section: event.target.value } : current
                      )
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      items: prev.items.filter((_, currentIndex) => currentIndex !== index)
                    }))
                  }
                  disabled={form.items.length <= 1}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { label: "", section: "Itens de inspecao" }]
                }))
              }
            >
              Adicionar item
            </button>
            <button className="btn-primary" disabled={saveTemplate.isPending || !equipmentsQuery.data?.length}>
              {saveTemplate.isPending ? "Salvando..." : editingTemplateId ? "Salvar alteracoes" : "Salvar modelo de checklist"}
            </button>
            <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={!editingTemplateId}>
              Cancelar edicao
            </button>
          </div>
          {!equipmentsQuery.data?.length && (
            <p className="text-sm text-amber-700">Cadastre pelo menos um equipamento para criar um checklist.</p>
          )}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {(saveTemplate.isError || deleteTemplate.isError) && (
            <p className="text-sm text-red-700">
              {(saveTemplate.error as Error)?.message || (deleteTemplate.error as Error)?.message}
            </p>
          )}
        </form>
      </section>

      <section className="card">
        <h2 className="section-title mb-3">Modelos cadastrados</h2>
        <div className="space-y-2">
          {templatesQuery.data?.map((template) => (
            <div key={template.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{template.name}</p>
              <p className="text-slate-500">
                Equipamento: {template.equipment?.name ?? "-"} | Periodicidade: {template.periodicity}
              </p>
              <p>Itens: {template.items?.length ?? 0}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => startEdit(template)}>
                  Editar
                </button>
                <button type="button" className="btn-danger" onClick={() => removeTemplate(template)}>
                  Apagar
                </button>
              </div>
            </div>
          ))}
          {!templatesQuery.data?.length && (
            <p className="text-sm text-slate-500">Nenhum modelo cadastrado ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}
