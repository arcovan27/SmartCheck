import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

type Epi = {
  id: string;
  name: string;
  description?: string | null;
  ca: string;
  category: string;
  validityDate?: string | null;
  unit: string;
  purchasePrice?: number | null;
  stock: number;
  minimumStock: number;
  isActive: boolean;
};

type EpiMovement = {
  epiId: string;
  movementType: "ENTREGA" | "DEVOLUCAO";
  quantity: number;
  date: string;
};

const epiFormInitial = {
  name: "",
  description: "",
  ca: "",
  category: "",
  validityDate: "",
  unit: "UN",
  purchasePrice: "",
  stock: 0,
  minimumStock: 0,
  isActive: true
};

export function EpiPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [epiForm, setEpiForm] = useState(epiFormInitial);
  const [editingEpiId, setEditingEpiId] = useState<string | null>(null);
  const [epiActionMessage, setEpiActionMessage] = useState("");

  const episQuery = useQuery({ queryKey: ["epis"], queryFn: () => apiRequest<Epi[]>("/epis") });
  const movementsQuery = useQuery({
    queryKey: ["epi-deliveries-for-purchase"],
    queryFn: () => apiRequest<EpiMovement[]>("/epi-deliveries")
  });
  const companyQuery = useQuery({ queryKey: ["company"], queryFn: () => apiRequest<any>("/company") });
  const showLowStockFocus = searchParams.get("filtro") === "estoque-minimo";
  const lowStockEpis = useMemo(
    () => (episQuery.data ?? []).filter((epi) => epi.isActive && epi.stock <= epi.minimumStock),
    [episQuery.data]
  );

  const consumptionByEpi = useMemo(() => {
    const map = new Map<string, { net30Days: number; avgPerDay: number }>();
    const now = new Date();
    const periodDays = 30;
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - periodDays);

    for (const movement of movementsQuery.data ?? []) {
      const movementDate = new Date(movement.date);
      if (movementDate < windowStart) continue;

      const current = map.get(movement.epiId) ?? { net30Days: 0, avgPerDay: 0 };
      const delta = movement.movementType === "ENTREGA" ? movement.quantity : -movement.quantity;
      current.net30Days += delta;
      map.set(movement.epiId, current);
    }

    for (const [epiId, value] of map.entries()) {
      const net = Math.max(value.net30Days, 0);
      map.set(epiId, { net30Days: net, avgPerDay: net / periodDays });
    }

    return map;
  }, [movementsQuery.data]);

  function generatePurchaseList() {
    const items = lowStockEpis;
    if (items.length === 0) {
      window.alert("Nao ha EPIs em estoque minimo no momento.");
      return;
    }
    const companyName = companyQuery.data?.tradeName || companyQuery.data?.legalName || "Empresa";
    const companyCnpj = companyQuery.data?.cnpj ?? "-";

    let grandTotal = 0;
    const rows = items
      .map((epi) => {
        const status = epi.stock === 0 ? "ZERADO" : "ESTOQUE MINIMO";
        const consumption = consumptionByEpi.get(epi.id) ?? { net30Days: 0, avgPerDay: 0 };
        const targetDays = 30;
        const targetByConsumption = Math.ceil(consumption.avgPerDay * targetDays);
        const targetStock = Math.max(epi.minimumStock, targetByConsumption);
        const suggestedQty = Math.max(targetStock - epi.stock, 0);
        const unitPrice = epi.purchasePrice ?? null;
        const itemTotal = unitPrice !== null ? unitPrice * suggestedQty : null;
        if (itemTotal !== null) grandTotal += itemTotal;
        return `
          <tr>
            <td>${epi.name}</td>
            <td>${epi.ca}</td>
            <td>${epi.category}</td>
            <td>${epi.stock}</td>
            <td>${epi.minimumStock}</td>
            <td>${consumption.net30Days}</td>
            <td>${status}</td>
            <td>${suggestedQty}</td>
            <td>${unitPrice !== null ? unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}</td>
            <td>${itemTotal !== null ? itemTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}</td>
          </tr>
        `;
      })
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Lista de compra de EPI</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 6px 0; font-size: 22px; }
            p { margin: 0 0 12px 0; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>Lista de compra de EPI</h1>
          <p><strong>Empresa:</strong> ${companyName} | <strong>CNPJ:</strong> ${companyCnpj}</p>
          <p>Gerado em: ${new Date().toLocaleString("pt-BR")}</p>
          <table>
            <thead>
              <tr>
                <th>EPI</th>
                <th>CA</th>
                <th>Categoria</th>
                <th>Estoque atual</th>
                <th>Estoque minimo</th>
                <th>Consumo 30 dias</th>
                <th>Status</th>
                <th>Sugestao compra</th>
                <th>Valor unitario</th>
                <th>Total previsto</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top: 12px; font-weight: 700;">
            Gasto total previsto: ${grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

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
      purchasePrice: epiForm.purchasePrice === "" ? null : Number(epiForm.purchasePrice),
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
      purchasePrice: epi.purchasePrice === null || epi.purchasePrice === undefined ? "" : String(epi.purchasePrice),
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
      {showLowStockFocus && (
        <section className="card border border-red-200 bg-red-50">
          <h2 className="section-title mb-2 text-red-800">EPIs em estoque minimo</h2>
          {lowStockEpis.length === 0 ? (
            <p className="text-sm text-emerald-700">Sem itens em alerta no momento.</p>
          ) : (
            <div className="space-y-2">
              {lowStockEpis.map((epi) => (
                <div key={`alert-${epi.id}`} className="rounded-xl border border-red-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-red-800">{epi.name}</p>
                  <p className="text-slate-600">
                    CA {epi.ca} | {epi.category}
                  </p>
                  <p>
                    Estoque atual: <strong>{epi.stock}</strong> ({epi.unit}) | Minimo:{" "}
                    <strong>{epi.minimumStock}</strong>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
        <div className="grid gap-2 sm:grid-cols-4">
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
            <label className="text-xs font-semibold text-slate-600">Valor de compra (R$)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              placeholder="Opcional"
              value={epiForm.purchasePrice}
              onChange={(e) => setEpiForm({ ...epiForm, purchasePrice: e.target.value })}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">EPIs cadastrados</h2>
          <button type="button" className="btn-secondary" onClick={generatePurchaseList}>
            Gerar lista de compra
          </button>
        </div>
        <div className="space-y-2">
          {episQuery.data?.map((epi) => (
            <div
              key={epi.id}
              className={`rounded-xl border p-3 text-sm ${
                epi.stock <= epi.minimumStock ? "border-red-200 bg-red-50/50" : "border-slate-200"
              }`}
            >
              <p className="font-semibold">{epi.name}</p>
              <p className="text-slate-500">
                CA {epi.ca} | {epi.category}
              </p>
              <p>
                Estoque: <strong>{epi.stock}</strong> ({epi.unit}) | Minimo: {epi.minimumStock}
              </p>
              <p className="text-slate-500">
                Valor compra:{" "}
                {epi.purchasePrice !== null && epi.purchasePrice !== undefined
                  ? epi.purchasePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "-"}
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
