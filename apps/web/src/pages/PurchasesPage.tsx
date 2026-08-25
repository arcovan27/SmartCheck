import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAuth, userHasPermission } from "../lib/auth";

type PurchaseItemForm = {
  type: string;
  catalogItemId: string;
  rawMaterialId: string;
  description: string;
  quantity: string;
  unit: string;
  technicalDescription: string;
  application: string;
};

const emptyItem = (): PurchaseItemForm => ({ type: "PRODUTO", catalogItemId: "", rawMaterialId: "", description: "", quantity: "1", unit: "UN", technicalDescription: "", application: "" });
const statusLabels: Record<string, string> = { RASCUNHO: "Rascunho", ENVIADA: "Enviada", PENDENTE_COTACAO: "Pendente de cotação", EM_COTACAO: "Em cotação", AGUARDANDO_APROVACAO: "Aguardando aprovação", APROVADA: "Aprovada", REJEITADA: "Rejeitada", CANCELADA: "Cancelada", CONVERTIDA_ORDEM_COMPRA: "Convertida em OC" };
const typeLabels: Record<string, string> = { PRODUTO: "Produto", MATERIA_PRIMA: "Matéria-prima", INSUMO: "Insumo", EQUIPAMENTO: "Equipamento", SERVICO: "Serviço", OUTRO: "Outro" };

export function PurchasesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ costCenterId: "", departmentId: "", needBy: "", priority: "NORMAL", purpose: "", notes: "", isEmergency: false, emergencyJustification: "", items: [emptyItem()] });
  const canCreate = userHasPermission(user, "PURCHASE_REQUEST_CREATE");

  const list = useQuery({ queryKey: ["purchase-requests"], queryFn: () => apiRequest<any>("/purchase-requests") });
  const options = useQuery({ queryKey: ["purchase-options"], queryFn: () => apiRequest<any>("/purchases/options"), enabled: showForm });
  const create = useMutation({
    mutationFn: () => apiRequest<any>("/purchase-requests", { method: "POST", body: JSON.stringify({ ...form, departmentId: form.departmentId || null, notes: form.notes || null, emergencyJustification: form.emergencyJustification || null, attachmentIds: [], items: form.items.map((item) => ({ ...item, catalogItemId: item.catalogItemId || null, rawMaterialId: item.rawMaterialId || null, technicalDescription: item.technicalDescription || null, application: item.application || null })) }) }),
    onSuccess: (data) => { setMessage(`${data.displayNumber} criada como rascunho.`); setShowForm(false); setForm({ costCenterId: "", departmentId: "", needBy: "", priority: "NORMAL", purpose: "", notes: "", isEmergency: false, emergencyJustification: "", items: [emptyItem()] }); void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] }); }
  });
  const submit = useMutation({
    mutationFn: (request: any) => apiRequest<any>(`/purchase-requests/${request.id}/submit`, { method: "POST", body: JSON.stringify({ expectedVersion: request.lockVersion }) }),
    onSuccess: (data) => { setMessage(`${data.displayNumber} enviada para cotação.`); void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] }); }
  });

  const summary = useMemo(() => {
    const items = list.data?.items ?? [];
    return { total: items.length, drafts: items.filter((item: any) => item.status === "RASCUNHO").length, pending: items.filter((item: any) => item.status === "PENDENTE_COTACAO").length, emergency: items.filter((item: any) => item.isEmergency).length };
  }, [list.data]);

  function updateItem(index: number, patch: Partial<PurchaseItemForm>) { setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })); }
  function selectRegisteredItem(index: number, value: string) {
    const item = form.items[index];
    const isRaw = item.type === "MATERIA_PRIMA";
    const source = isRaw ? options.data?.rawMaterials : options.data?.products;
    const selected = source?.find((candidate: any) => candidate.id === value);
    updateItem(index, isRaw ? { rawMaterialId: value, catalogItemId: "", description: selected?.name ?? item.description, unit: selected?.unit ?? item.unit } : { catalogItemId: value, rawMaterialId: "", description: selected?.name ?? selected?.description ?? item.description, unit: selected?.unit ?? item.unit });
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Compras</p><h1 className="text-3xl font-extrabold">Solicitações de compra</h1><p className="mt-1 text-slate-600">Rascunho, envio auditado e janela de compras parametrizada.</p></div>{canCreate ? <button className="btn-primary min-h-12" onClick={() => setShowForm((value) => !value)}>{showForm ? "Fechar formulário" : "Nova solicitação"}</button> : null}</header>
    {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" role="status">{message}</p> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Solicitações", summary.total], ["Rascunhos", summary.drafts], ["Aguardando cotação", summary.pending], ["Emergenciais", summary.emergency]].map(([label, value]) => <article className="card" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-extrabold">{value}</p></article>)}</section>

    {showForm ? <form className="card space-y-5" onSubmit={(event) => { event.preventDefault(); setMessage(""); create.mutate(); }}>
      <h2 className="section-title">Nova solicitação</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold">Centro de custo<select className="select mt-1" required value={form.costCenterId} onChange={(event) => setForm({ ...form, costCenterId: event.target.value })}><option value="">Selecione</option>{options.data?.costCenters.map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Setor<select className="select mt-1" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">Não informado</option>{options.data?.departments.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Necessário até<input className="input mt-1" type="date" required value={form.needBy} onChange={(event) => setForm({ ...form, needBy: event.target.value })} /></label>
        <label className="text-sm font-semibold">Prioridade<select className="select mt-1" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
      </div>
      <label className="block text-sm font-semibold">Aplicação/finalidade<textarea className="input mt-1 min-h-20" required value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></label>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border p-3 font-semibold"><input type="checkbox" checked={form.isEmergency} onChange={(event) => setForm({ ...form, isEmergency: event.target.checked })} />Emergencial / risco de parada de fábrica</label>
      {form.isEmergency ? <label className="block text-sm font-semibold">Justificativa da emergência<textarea className="input mt-1 min-h-20" minLength={10} required value={form.emergencyJustification} onChange={(event) => setForm({ ...form, emergencyJustification: event.target.value })} /></label> : null}
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-extrabold">Itens</h3><button type="button" className="btn-secondary" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}>Adicionar item</button></div>{form.items.map((item, index) => <article className="rounded-2xl border p-4" key={index}><div className="mb-3 flex justify-between"><strong>Item {index + 1}</strong>{form.items.length > 1 ? <button className="text-sm font-semibold text-red-700" type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}>Remover</button> : null}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold">Tipo<select className="select mt-1" value={item.type} onChange={(event) => updateItem(index, { type: event.target.value, catalogItemId: "", rawMaterialId: "" })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {(item.type === "PRODUTO" || item.type === "SERVICO") ? <label className="text-sm font-semibold">Item cadastrado<select className="select mt-1" value={item.catalogItemId} onChange={(event) => selectRegisteredItem(index, event.target.value)}><option value="">Descrição livre</option>{options.data?.products.filter((candidate: any) => item.type === "SERVICO" ? candidate.type === "SERVICO" : true).map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name || candidate.description}</option>)}</select></label> : null}
        {item.type === "MATERIA_PRIMA" ? <label className="text-sm font-semibold">Matéria-prima<select className="select mt-1" value={item.rawMaterialId} onChange={(event) => selectRegisteredItem(index, event.target.value)}><option value="">Descrição livre</option>{options.data?.rawMaterials.map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>)}</select></label> : null}
        <label className="text-sm font-semibold md:col-span-2">Descrição<input className="input mt-1" required value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></label>
        <label className="text-sm font-semibold">Quantidade<input className="input mt-1" inputMode="decimal" required value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value.replace(",", ".") })} /></label>
        <label className="text-sm font-semibold">Unidade<input className="input mt-1" required value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} /></label>
        <label className="text-sm font-semibold md:col-span-2">Descrição técnica<input className="input mt-1" value={item.technicalDescription} onChange={(event) => updateItem(index, { technicalDescription: event.target.value })} /></label>
      </div></article>)}</div>
      <label className="block text-sm font-semibold">Observações<textarea className="input mt-1 min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <button className="btn-primary min-h-12" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar rascunho"}</button>{create.isError ? <p className="text-red-700">{(create.error as Error).message}</p> : null}
    </form> : null}

    <section className="card"><h2 className="section-title">Solicitações</h2>{list.isLoading ? <p className="py-8 text-center text-slate-500">Carregando…</p> : null}{list.isError ? <p className="text-red-700">{(list.error as Error).message}</p> : null}<div className="mt-4 grid gap-3">{list.data?.items.map((request: any) => <article className="rounded-2xl border p-4" key={request.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold">{request.displayNumber}</h3><p className="text-sm text-slate-500">{request.purpose}</p></div><span className="badge bg-slate-100 text-slate-800">{statusLabels[request.status] ?? request.status}</span></div><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-500">Solicitante</dt><dd className="font-semibold">{request.requesterEmployee?.name || request.requesterUser.email}</dd></div><div><dt className="text-slate-500">Centro de custo</dt><dd className="font-semibold">{request.costCenter.code} · {request.costCenter.name}</dd></div><div><dt className="text-slate-500">Necessidade</dt><dd className="font-semibold">{new Date(request.needBy).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</dd></div><div><dt className="text-slate-500">Itens</dt><dd className="font-semibold">{request.items.length}</dd></div></dl>{request.isEmergency ? <p className="mt-3 rounded-xl bg-amber-50 p-2 text-sm font-semibold text-amber-900">Emergencial — {request.emergencyJustification}</p> : null}{request.status === "RASCUNHO" && (request.requesterUserId === user?.id || userHasPermission(user, "PROCUREMENT_ADMIN")) ? <button className="btn-primary mt-3" disabled={submit.isPending} onClick={() => submit.mutate(request)}>Enviar para compras</button> : null}</article>)}</div>{submit.isError ? <p className="mt-3 text-red-700">{(submit.error as Error).message}</p> : null}</section>
  </div>;
}

