import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

type ChecklistCode = "OUTRO";

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const [templateForm, setTemplateForm] = useState({
    name: "",
    code: "OUTRO" as ChecklistCode,
    periodicity: "DIARIO",
    equipmentId: "",
    description: "",
    items: [{ label: "", section: "Itens de inspecao" }]
  });

  const equipmentsQuery = useQuery({ queryKey: ["equipments"], queryFn: () => apiRequest<any[]>("/equipments") });

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
        items: [{ label: "", section: "Itens de inspecao" }]
      });
    }
  });

  function submitTemplate(event: FormEvent) {
    event.preventDefault();
    createTemplate.mutate({
      name: templateForm.name,
      code: "OUTRO",
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
          Aqui voce define apenas os modelos. A execucao operacional fica no menu "Execucao de Checklist".
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
                  items: [...prev.items, { label: "", section: "Itens de inspecao" }]
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
            <p className="text-sm text-amber-700">Cadastre pelo menos um equipamento para criar um checklist.</p>
          )}
        </form>
      </section>
    </div>
  );
}
