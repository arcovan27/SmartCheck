import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "../lib/api";
import { useAuth, userHasPermission } from "../lib/auth";

type QuoteStatus = "RASCUNHO" | "EMITIDO" | "APROVADO" | "REJEITADO" | "VENCIDO" | "CANCELADO";
type QuoteItem = { catalogItemId?: string | null; code: string; description: string; unit: string; quantity: string; unitPrice: string; discount: string; total?: string };
type Quote = { id: string; number: string; issueDate: string; validityDate: string; status: QuoteStatus; total: string | null; companyId: string; unitId?: string | null; customerId?: string | null; commercialOwnerId?: string | null; paymentTerms?: string | null; deliveryForecast?: string | null; commercialNotes?: string | null; notes?: string | null; discountTotal: string; surchargeTotal: string; customer?: { legalName: string; tradeName?: string | null } | null; commercialOwner?: { email: string; employee?: { name: string } | null } | null; createdBy?: { email: string; employee?: { name: string } | null }; company?: { legalName: string; tradeName?: string | null }; unit?: { name: string } | null; items?: QuoteItem[]; history?: Array<{ id: string; action: string; createdAt: string; actorUser: { email: string } }> };
type Options = { companies: Array<{ id: string; legalName: string; tradeName?: string | null }>; units: Array<{ id: string; companyId: string; name: string }>; customers: Array<{ id: string; companyId: string; legalName: string; tradeName?: string | null }>; catalogItems: Array<{ id: string; companyId: string; code: string; description: string; unit: string; unitPrice: string; type: string }>; users: Array<{ id: string; email: string; employee?: { name: string } | null }> };
type ListResponse = { items: Quote[]; total: number; page: number; pageSize: number; summary: { total: number; open: number; approved: number; rejected: number; expired: number; quotedValue: string | null; approvedValue: string | null } };

const statusLabel: Record<QuoteStatus, string> = { RASCUNHO: "Rascunho", EMITIDO: "Emitido", APROVADO: "Aprovado", REJEITADO: "Rejeitado", VENCIDO: "Vencido", CANCELADO: "Cancelado" };
const actionLabel: Record<string, string> = { QUOTE_CREATE: "Criação", QUOTE_UPDATE: "Alteração", QUOTE_DUPLICATE: "Duplicação", QUOTE_EMITIDO: "Emissão", QUOTE_APROVADO: "Aprovação", QUOTE_REJEITADO: "Rejeição", QUOTE_CANCELADO: "Cancelamento", QUOTE_DOCUMENT_GENERATE: "Geração do espelho", QUOTE_DELETE: "Exclusão lógica" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const brDate = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "-";
const brDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "-";
const brl = (value?: string | number | null) => value === null || value === undefined ? "Oculto" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const decimal = (value: string) => Number(value.replace(",", ".")) || 0;
const newItem = (): QuoteItem => ({ code: "", description: "", unit: "UN", quantity: "1", unitPrice: "0", discount: "0" });
const emptyForm = () => ({ companyId: "", unitId: "", customerId: "", issueDate: today(), validityDate: plusDays(15), commercialOwnerId: "", paymentTerms: "", deliveryForecast: "", commercialNotes: "", notes: "", discountTotal: "0", surchargeTotal: "0", items: [newItem()] });

function statusClass(status: QuoteStatus) {
  if (status === "APROVADO") return "badge-success";
  if (status === "REJEITADO" || status === "CANCELADO") return "badge-danger";
  if (status === "EMITIDO" || status === "VENCIDO") return "badge-warning";
  return "badge-neutral";
}

async function fetchPdf(id: string, disposition: "inline" | "attachment") {
  const token = localStorage.getItem("smartcheck.token");
  const response = await fetch(getApiUrl(`/quotes/${id}/pdf?disposition=${disposition}`), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Falha ao gerar o Espelho do Pedido" }));
    throw new Error(data.message);
  }
  return response.blob();
}

export function QuotesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ number: "", from: "", to: "", customerId: "", responsibleId: "", companyId: "", unitId: "", status: "", page: 1 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerForm, setCustomerForm] = useState({ legalName: "", tradeName: "", document: "", phone: "", email: "", responsibleContact: "", addressLine: "", city: "", state: "", zipCode: "" });
  const [message, setMessage] = useState<string | null>(null);
  const optionsQuery = useQuery({ queryKey: ["quote-options"], queryFn: () => apiRequest<Options>("/quotes/options") });
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(filters.page), pageSize: "20" });
    Object.entries(filters).forEach(([key, value]) => { if (key !== "page" && value) params.set(key === "from" || key === "to" ? key : key, String(value)); });
    return params.toString();
  }, [filters]);
  const quotesQuery = useQuery({ queryKey: ["quotes", queryString], queryFn: () => apiRequest<ListResponse>(`/quotes?${queryString}`) });
  const detailQuery = useQuery({ queryKey: ["quote", selectedId], queryFn: () => apiRequest<Quote>(`/quotes/${selectedId}`), enabled: Boolean(selectedId) });
  const options = optionsQuery.data;
  const can = (permission: string) => userHasPermission(user, permission);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, unitId: form.unitId || null, customerId: form.customerId || null, commercialOwnerId: form.commercialOwnerId || null, idempotencyKey: editingId ? undefined : crypto.randomUUID() };
      return apiRequest<Quote>(editingId ? `/quotes/${editingId}` : "/quotes", { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); await queryClient.invalidateQueries({ queryKey: ["quotes"] }); },
    onError: (error: Error) => setMessage(error.message)
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiRequest(`/quotes/${id}/${action}`, { method: "POST" }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["quotes"] }), queryClient.invalidateQueries({ queryKey: ["quote"] })]); },
    onError: (error: Error) => setMessage(error.message)
  });

  const customerMutation = useMutation({
    mutationFn: () => apiRequest<{ id: string }>("/quote-customers", { method: "POST", body: JSON.stringify({ ...customerForm, companyId: form.companyId, email: customerForm.email || null }) }),
    onSuccess: async (customer) => { setForm((current) => ({ ...current, customerId: customer.id })); setShowCustomerForm(false); setCustomerForm({ legalName: "", tradeName: "", document: "", phone: "", email: "", responsibleContact: "", addressLine: "", city: "", state: "", zipCode: "" }); await queryClient.invalidateQueries({ queryKey: ["quote-options"] }); },
    onError: (error: Error) => setMessage(error.message)
  });

  function openNew() {
    const initial = emptyForm();
    if (options?.companies.length === 1) initial.companyId = options.companies[0].id;
    setForm(initial); setEditingId(null); setMessage(null); setShowForm(true);
  }

  async function openEdit(quote: Quote) {
    const detail = await apiRequest<Quote>(`/quotes/${quote.id}`);
    setForm({ companyId: detail.companyId, unitId: detail.unitId ?? "", customerId: detail.customerId ?? "", issueDate: detail.issueDate.slice(0, 10), validityDate: detail.validityDate.slice(0, 10), commercialOwnerId: detail.commercialOwnerId ?? "", paymentTerms: detail.paymentTerms ?? "", deliveryForecast: detail.deliveryForecast ?? "", commercialNotes: detail.commercialNotes ?? "", notes: detail.notes ?? "", discountTotal: String(detail.discountTotal), surchargeTotal: String(detail.surchargeTotal), items: detail.items?.map((item) => ({ ...item, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discount: String(item.discount) })) ?? [newItem()] });
    setEditingId(quote.id); setMessage(null); setShowForm(true);
  }

  function setItem(index: number, patch: Partial<QuoteItem>) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function selectCatalog(index: number, catalogItemId: string) {
    const item = options?.catalogItems.find((candidate) => candidate.id === catalogItemId);
    setItem(index, item ? { catalogItemId: item.id, code: item.code, description: item.description, unit: item.unit, unitPrice: String(item.unitPrice) } : { catalogItemId: null });
  }

  const calculated = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + Math.max(0, decimal(item.quantity) * decimal(item.unitPrice) - decimal(item.discount)), 0);
    return { subtotal, total: subtotal - decimal(form.discountTotal) + decimal(form.surchargeTotal) };
  }, [form]);

  async function pdfAction(id: string, action: "view" | "download" | "print") {
    try {
      setMessage(null);
      const blob = await fetchPdf(id, action === "download" ? "attachment" : "inline");
      const url = URL.createObjectURL(blob);
      if (action === "download") {
        const link = document.createElement("a"); link.href = url; link.download = `espelho-pedido.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (action === "print") {
        const frame = document.createElement("iframe"); frame.style.display = "none"; frame.src = url; document.body.appendChild(frame); frame.onload = () => { frame.contentWindow?.print(); setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000); };
      } else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage((error as Error).message); }
  }

  const summary = quotesQuery.data?.summary;
  const kpis = [["Total no período", summary?.total ?? 0], ["Em aberto", summary?.open ?? 0], ["Aprovados", summary?.approved ?? 0], ["Rejeitados", summary?.rejected ?? 0], ["Vencidos", summary?.expired ?? 0], ["Valor orçado", brl(summary?.quotedValue)], ["Valor aprovado", brl(summary?.approvedValue)]];
  const companyUnits = options?.units.filter((unit) => !filters.companyId || unit.companyId === filters.companyId) ?? [];

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-700">Comercial</p><h2 className="text-3xl font-extrabold">Orçamentos</h2><p className="mt-1 text-slate-600">Criação, acompanhamento, histórico e Espelho do Pedido.</p></div>{can("QUOTE_CREATE") ? <button className="btn-primary" onClick={openNew}>Novo orçamento</button> : null}</header>
    {message ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}<button className="float-right font-bold" onClick={() => setMessage(null)}>Fechar</button></div> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{kpis.map(([label, value]) => <div className="card" key={String(label)}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-extrabold">{value}</p></div>)}</section>
    <section className="card"><h3 className="section-title">Filtros</h3><div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <input className="input" placeholder="Número" value={filters.number} onChange={(e) => setFilters({ ...filters, number: e.target.value, page: 1 })} />
      <input className="input" type="date" aria-label="Data inicial" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} />
      <input className="input" type="date" aria-label="Data final" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} />
      <select className="select" value={filters.customerId} onChange={(e) => setFilters({ ...filters, customerId: e.target.value, page: 1 })}><option value="">Todos os clientes</option>{options?.customers.map((item) => <option key={item.id} value={item.id}>{item.tradeName || item.legalName}</option>)}</select>
      <select className="select" value={filters.responsibleId} onChange={(e) => setFilters({ ...filters, responsibleId: e.target.value, page: 1 })}><option value="">Todos os responsáveis</option>{options?.users.map((item) => <option key={item.id} value={item.id}>{item.employee?.name || item.email}</option>)}</select>
      <select className="select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">Todas as situações</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select className="select" value={filters.companyId} onChange={(e) => setFilters({ ...filters, companyId: e.target.value, unitId: "", page: 1 })}><option value="">Todas as empresas</option>{options?.companies.map((item) => <option key={item.id} value={item.id}>{item.tradeName || item.legalName}</option>)}</select>
      <select className="select" value={filters.unitId} onChange={(e) => setFilters({ ...filters, unitId: e.target.value, page: 1 })}><option value="">Todas as unidades</option>{companyUnits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div></section>
    <section className="card overflow-hidden p-0"><div className="border-b border-slate-200 px-4 py-4"><h3 className="section-title">Orçamentos mais recentes</h3></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Número", "Emissão", "Cliente", "Responsável", "Validade", "Valor total", "Situação", "Ações"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
      {quotesQuery.isLoading ? <tr><td colSpan={8} className="p-8 text-center">Carregando...</td></tr> : quotesQuery.data?.items.length ? quotesQuery.data.items.map((quote) => <tr key={quote.id} className="align-top"><td className="px-4 py-3 font-bold">{quote.number}</td><td className="px-4 py-3">{brDate(quote.issueDate)}</td><td className="px-4 py-3">{quote.customer?.tradeName || quote.customer?.legalName || "Não informado"}</td><td className="px-4 py-3">{quote.commercialOwner?.employee?.name || quote.commercialOwner?.email || quote.createdBy?.employee?.name || quote.createdBy?.email}</td><td className="px-4 py-3">{brDate(quote.validityDate)}</td><td className="px-4 py-3 font-bold">{brl(quote.total)}</td><td className="px-4 py-3"><span className={statusClass(quote.status)}>{statusLabel[quote.status]}</span></td><td className="px-4 py-3"><div className="flex min-w-52 flex-wrap gap-1">
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setSelectedId(quote.id)}>Visualizar</button>
        {quote.status === "RASCUNHO" && can("QUOTE_EDIT") ? <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void openEdit(quote)}>Editar</button> : null}
        {can("QUOTE_CREATE") ? <button className="btn-secondary px-2 py-1 text-xs" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ id: quote.id, action: "duplicate" })}>Duplicar</button> : null}
        {quote.status === "RASCUNHO" && can("QUOTE_ISSUE") ? <button className="btn-primary px-2 py-1 text-xs" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ id: quote.id, action: "issue" })}>Emitir</button> : null}
        {quote.status === "EMITIDO" && can("QUOTE_DECIDE") ? <><button className="btn-primary px-2 py-1 text-xs" onClick={() => actionMutation.mutate({ id: quote.id, action: "approve" })}>Aprovar</button><button className="btn-danger px-2 py-1 text-xs" onClick={() => actionMutation.mutate({ id: quote.id, action: "reject" })}>Rejeitar</button></> : null}
        {["EMITIDO", "VENCIDO"].includes(quote.status) && can("QUOTE_CANCEL") ? <button className="btn-danger px-2 py-1 text-xs" onClick={() => actionMutation.mutate({ id: quote.id, action: "cancel" })}>Cancelar</button> : null}
        {quote.status !== "RASCUNHO" && can("QUOTE_DOCUMENT") ? <><button className="btn-secondary px-2 py-1 text-xs" onClick={() => void pdfAction(quote.id, "view")}>Espelho</button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => void pdfAction(quote.id, "download")}>PDF</button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => void pdfAction(quote.id, "print")}>Imprimir</button></> : null}
      </div></td></tr>) : <tr><td colSpan={8} className="p-8 text-center text-slate-500">Nenhum orçamento encontrado.</td></tr>}
    </tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 p-4"><span className="text-sm text-slate-500">{quotesQuery.data?.total ?? 0} registros</span><div className="flex gap-2"><button className="btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Anterior</button><button className="btn-secondary" disabled={(quotesQuery.data?.items.length ?? 0) < 20} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Próxima</button></div></div></section>

    {showForm ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-4"><form className="mx-auto my-4 max-w-6xl rounded-3xl bg-white p-6 shadow-2xl" onSubmit={(e) => { e.preventDefault(); setMessage(null); saveMutation.mutate(); }}><div className="flex items-center justify-between"><div><p className="text-sm font-bold uppercase text-brand-700">{editingId ? "Editar rascunho" : "Novo orçamento"}</p><h3 className="text-2xl font-extrabold">Dados do orçamento</h3></div><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Fechar</button></div><div className="mt-5 grid gap-3 md:grid-cols-3">
      <label className="text-xs font-bold">Empresa<select required className="select mt-1" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, unitId: "", customerId: "" })}><option value="">Selecione</option>{options?.companies.map((item) => <option key={item.id} value={item.id}>{item.tradeName || item.legalName}</option>)}</select></label>
      <label className="text-xs font-bold">Unidade<select className="select mt-1" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}><option value="">Sem unidade</option>{options?.units.filter((item) => item.companyId === form.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-bold">Cliente<select className="select mt-1" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Selecionar depois</option>{options?.customers.filter((item) => item.companyId === form.companyId).map((item) => <option key={item.id} value={item.id}>{item.tradeName || item.legalName}</option>)}</select><button type="button" className="mt-1 text-xs font-bold text-brand-700" disabled={!form.companyId} onClick={() => setShowCustomerForm((value) => !value)}>+ Cadastrar cliente</button></label>
      <label className="text-xs font-bold">Data de emissão<input required type="date" className="input mt-1" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></label><label className="text-xs font-bold">Validade<input required type="date" min={form.issueDate} className="input mt-1" value={form.validityDate} onChange={(e) => setForm({ ...form, validityDate: e.target.value })} /></label><label className="text-xs font-bold">Responsável comercial<select className="select mt-1" value={form.commercialOwnerId} onChange={(e) => setForm({ ...form, commercialOwnerId: e.target.value })}><option value="">Responsável pela criação</option>{options?.users.map((item) => <option key={item.id} value={item.id}>{item.employee?.name || item.email}</option>)}</select></label>
      <label className="text-xs font-bold">Condição de pagamento<input className="input mt-1" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></label><label className="text-xs font-bold">Prazo/previsão de entrega<input className="input mt-1" value={form.deliveryForecast} onChange={(e) => setForm({ ...form, deliveryForecast: e.target.value })} /></label><label className="text-xs font-bold">Observações comerciais<input className="input mt-1" value={form.commercialNotes} onChange={(e) => setForm({ ...form, commercialNotes: e.target.value })} /></label>
    </div>{showCustomerForm ? <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4"><h4 className="font-extrabold">Novo cliente</h4><div className="mt-3 grid gap-2 md:grid-cols-4"><input required className="input" placeholder="Nome/razão social" value={customerForm.legalName} onChange={(e) => setCustomerForm({ ...customerForm, legalName: e.target.value })} /><input className="input" placeholder="Nome fantasia" value={customerForm.tradeName} onChange={(e) => setCustomerForm({ ...customerForm, tradeName: e.target.value })} /><input className="input" placeholder="CPF/CNPJ" value={customerForm.document} onChange={(e) => setCustomerForm({ ...customerForm, document: e.target.value })} /><input className="input" placeholder="Contato responsável" value={customerForm.responsibleContact} onChange={(e) => setCustomerForm({ ...customerForm, responsibleContact: e.target.value })} /><input className="input" placeholder="Telefone" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /><input type="email" className="input" placeholder="E-mail" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /><input className="input md:col-span-2" placeholder="Endereço" value={customerForm.addressLine} onChange={(e) => setCustomerForm({ ...customerForm, addressLine: e.target.value })} /><input className="input" placeholder="Cidade" value={customerForm.city} onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })} /><input className="input" maxLength={2} placeholder="UF" value={customerForm.state} onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })} /><input className="input" placeholder="CEP" value={customerForm.zipCode} onChange={(e) => setCustomerForm({ ...customerForm, zipCode: e.target.value })} /><button type="button" className="btn-primary" disabled={customerMutation.isPending || customerForm.legalName.length < 2} onClick={() => customerMutation.mutate()}>{customerMutation.isPending ? "Salvando..." : "Salvar cliente"}</button></div></div> : null}<div className="mt-6 flex items-center justify-between"><h4 className="text-lg font-extrabold">Itens</h4><button type="button" className="btn-secondary" onClick={() => setForm({ ...form, items: [...form.items, newItem()] })}>Adicionar item</button></div><div className="mt-3 space-y-3">{form.items.map((item, index) => <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-12">
      <label className="text-xs font-bold md:col-span-3">Produto/serviço<select className="select mt-1" value={item.catalogItemId ?? ""} onChange={(e) => selectCatalog(index, e.target.value)}><option value="">Item livre</option>{options?.catalogItems.filter((catalog) => catalog.companyId === form.companyId).map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.code} - {catalog.description}</option>)}</select></label><label className="text-xs font-bold md:col-span-1">Código<input required className="input mt-1" value={item.code} onChange={(e) => setItem(index, { code: e.target.value })} /></label><label className="text-xs font-bold md:col-span-3">Descrição<input required className="input mt-1" value={item.description} onChange={(e) => setItem(index, { description: e.target.value })} /></label><label className="text-xs font-bold md:col-span-1">Unidade<input required className="input mt-1" value={item.unit} onChange={(e) => setItem(index, { unit: e.target.value })} /></label><label className="text-xs font-bold md:col-span-1">Quantidade<input required type="number" min="0.0001" step="0.0001" className="input mt-1" value={item.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} /></label><label className="text-xs font-bold md:col-span-1">Valor unitário<input required type="number" min="0" step="0.0001" className="input mt-1" value={item.unitPrice} onChange={(e) => setItem(index, { unitPrice: e.target.value })} /></label><label className="text-xs font-bold md:col-span-1">Desconto<input type="number" min="0" step="0.01" className="input mt-1" value={item.discount} onChange={(e) => setItem(index, { discount: e.target.value })} /></label><div className="flex items-end md:col-span-1"><button type="button" className="btn-danger w-full px-2" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}>Remover</button></div>
    </div>)}</div><div className="mt-5 grid gap-3 md:grid-cols-[1fr,180px,180px,220px]"><label className="text-xs font-bold">Observações<textarea className="textarea mt-1 min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><label className="text-xs font-bold">Desconto geral<input type="number" min="0" step="0.01" className="input mt-1" value={form.discountTotal} onChange={(e) => setForm({ ...form, discountTotal: e.target.value })} /></label><label className="text-xs font-bold">Acréscimos<input type="number" min="0" step="0.01" className="input mt-1" value={form.surchargeTotal} onChange={(e) => setForm({ ...form, surchargeTotal: e.target.value })} /></label><div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs uppercase text-slate-300">Subtotal</p><p className="font-bold">{brl(calculated.subtotal)}</p><p className="mt-2 text-xs uppercase text-slate-300">Total</p><p className="text-2xl font-extrabold">{brl(calculated.total)}</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Salvando..." : "Salvar rascunho"}</button></div></form></div> : null}

    {selectedId ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-4"><div className="mx-auto my-5 max-w-4xl rounded-3xl bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-sm font-bold uppercase text-brand-700">Acompanhamento</p><h3 className="text-2xl font-extrabold">{detailQuery.data?.number ?? "Carregando..."}</h3></div><button className="btn-secondary" onClick={() => setSelectedId(null)}>Fechar</button></div>{detailQuery.data ? <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Cliente</p><p className="font-bold">{detailQuery.data.customer?.tradeName || detailQuery.data.customer?.legalName || "Não informado"}</p></div><div><p className="text-xs text-slate-500">Situação</p><span className={statusClass(detailQuery.data.status)}>{statusLabel[detailQuery.data.status]}</span></div><div><p className="text-xs text-slate-500">Validade</p><p className="font-bold">{brDate(detailQuery.data.validityDate)}</p></div><div><p className="text-xs text-slate-500">Total</p><p className="font-bold">{brl(detailQuery.data.total)}</p></div></div><div><h4 className="font-extrabold">Itens</h4><div className="mt-2 divide-y rounded-xl border">{detailQuery.data.items?.map((item, index) => <div className="grid grid-cols-[70px,1fr,120px] gap-3 p-3 text-sm" key={index}><span>{item.code}</span><span>{item.description}</span><strong className="text-right">{brl(item.total)}</strong></div>)}</div></div><div><h4 className="font-extrabold">Histórico e auditoria</h4><div className="mt-2 space-y-2">{detailQuery.data.history?.map((entry) => <div key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{actionLabel[entry.action] || entry.action}</strong><span className="ml-2 text-slate-500">{brDateTime(entry.createdAt)} · {entry.actorUser.email}</span></div>)}</div></div></div> : <p className="p-8 text-center">Carregando...</p>}</div></div> : null}
  </div>;
}
