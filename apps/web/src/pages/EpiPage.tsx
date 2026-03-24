import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

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
  const [epiForm, setEpiForm] = useState(epiFormInitial);
  const [editingEpiId, setEditingEpiId] = useState<string | null>(null);
  const [epiActionMessage, setEpiActionMessage] = useState("");

  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<Epi[]>("/epis") });

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

  return (
    <div className="space-y-4">
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
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Unidade</label>
            <input
              className="input"
              placeholder="UN"
              value={epiForm.unit}
              onChange={(e) => setEpiForm({ ...epiForm, unit: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Estoque</label>
            <input
              className="input"
              type="number"
              min={0}
              value={epiForm.stock}
              onChange={(e) => setEpiForm({ ...epiForm, stock: Number(e.target.value) })}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Estoque minimo</label>
            <input
              className="input"
              type="number"
              min={0}
              value={epiForm.minimumStock}
              onChange={(e) => setEpiForm({ ...epiForm, minimumStock: Number(e.target.value) })}
              required
            />
          </div>
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
    </div>
  );
}
