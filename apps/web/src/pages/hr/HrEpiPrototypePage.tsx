import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { formatBrazilDateTime, toBrazilDateInputValue } from "../../lib/datetime";
import { useAuth, userHasPermission } from "../../lib/auth";
import { EpiSectionTabs, HrPageHeader, HrSectionTabs, MetricCard, SectionHeading, StatusBadge } from "./HrPrototypeComponents";

type EpiItem = { id: string; name: string; description?: string; ca: string; category: string; validityDate?: string | null; unit: string; purchasePrice?: number | null; stock: number; minimumStock: number; isActive: boolean };
type EpiPageData = { items: EpiItem[]; total: number; page: number; pageSize: number; summary: { registered: number; stockTotal: number; lowStock: number }; canViewCosts: boolean };
type EmployeeOption = { id: string; name: string; registration: string };
type Movement = { id: string; movementType: string; quantity: number; date: string; movementReason?: string | null; unitCostSnapshot?: string | null; isEstimatedCost: boolean; employee: EmployeeOption; epi: { id: string; name: string; ca: string; unit: string } };
type EpiDashboard = { totalDelivered: number; movementCount: number; employeesReceiving: number; totalCost: number | null; costByScope: { name: string; value: number }[]; topEpis: { name: string; quantity: number }[]; canViewCosts: boolean };

export function HrEpiPrototypePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = userHasPermission(user, "EPI_MANAGE");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [showMovement, setShowMovement] = useState(false);
  const today = toBrazilDateInputValue();
  const [period, setPeriod] = useState({ startDate: `${today.slice(0, 7)}-01`, endDate: today });
  const [form, setForm] = useState({ employeeId: "", epiId: "", movementType: "ENTREGA", quantity: 1, movementReason: "" });
  const queryString = new URLSearchParams({ page: String(page), pageSize: "10", stockStatus: stockFilter });
  if (search) queryString.set("search", search);
  const episQuery = useQuery({ queryKey: ["hr-epis", page, search, stockFilter], queryFn: () => apiRequest<EpiPageData>(`/hr/epis?${queryString}`) });
  const movementQuery = useQuery({ queryKey: ["hr-epi-movements"], queryFn: () => apiRequest<{ items: Movement[]; total: number }>("/hr/epi-movements?page=1&pageSize=8") });
  const dashboardQueryString = new URLSearchParams(period).toString();
  const dashboardQuery = useQuery({ queryKey: ["hr-epi-dashboard", period], queryFn: () => apiRequest<EpiDashboard>(`/hr/epi-dashboard?${dashboardQueryString}`) });
  const employeesQuery = useQuery({ queryKey: ["hr-employee-options"], queryFn: () => apiRequest<{ items: EmployeeOption[] }>("/hr/employees?page=1&pageSize=100&isActive=true"), enabled: showMovement });
  const createMovement = useMutation({
    mutationFn: () => {
      const employee = employeesQuery.data?.items.find((item) => item.id === form.employeeId);
      return apiRequest("/epi-deliveries", { method: "POST", body: JSON.stringify({ ...form, quantity: Number(form.quantity), confirmationMethod: "LOGIN", employeeSignatureName: employee?.name ?? "Confirmação autenticada", employeeConfirmedAt: new Date().toISOString() }) });
    },
    onSuccess: async () => {
      setShowMovement(false);
      setForm({ employeeId: "", epiId: "", movementType: "ENTREGA", quantity: 1, movementReason: "" });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["hr-epis"] }), queryClient.invalidateQueries({ queryKey: ["hr-epi-movements"] }), queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] })]);
    }
  });
  const data = episQuery.data;
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 10)));

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <EpiSectionTabs />
      <HrPageHeader eyebrow="Recursos Humanos · EPI" title="Proteção, estoque e custo no mesmo fluxo" description="Cadastro, movimentações, fichas individuais e custo histórico dentro do escopo autorizado." action={canManage ? <div className="flex flex-wrap gap-2"><Link className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-white/20" to="/recursos-humanos/epi/ficha-entrega">Ficha de entrega</Link><button className="rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-brand-300" onClick={() => setShowMovement(true)}>Nova movimentação</button></div> : undefined} />

      <section className="card p-5">
        <SectionHeading title="Dashboard de EPI" description="Indicadores calculados diretamente das movimentações do período" action={<div className="flex gap-2"><input className="input" aria-label="Início do período" type="date" value={period.startDate} onChange={(event) => setPeriod({ ...period, startDate: event.target.value })} /><input className="input" aria-label="Fim do período" type="date" value={period.endDate} onChange={(event) => setPeriod({ ...period, endDate: event.target.value })} /></div>} />
        {dashboardQuery.isError ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Não foi possível carregar os indicadores do período.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="EPIs entregues" value={String(dashboardQuery.data?.totalDelivered ?? "—")} detail="Entregas e substituições no período" tone="success" /><MetricCard label="Movimentações" value={String(dashboardQuery.data?.movementCount ?? "—")} detail="Todos os tipos registrados" tone="info" /><MetricCard label="Funcionários atendidos" value={String(dashboardQuery.data?.employeesReceiving ?? "—")} detail="Funcionários distintos no período" />{dashboardQuery.data?.canViewCosts ? <MetricCard label="Custo das entregas" value={dashboardQuery.data.totalCost === null ? "—" : currency.format(dashboardQuery.data.totalCost)} detail="Valor histórico das movimentações" tone="warning" /> : null}</div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><h4 className="font-extrabold">EPIs mais entregues</h4><div className="mt-3 space-y-2">{dashboardQuery.data?.topEpis.map((item) => <div key={item.name} className="flex justify-between text-sm"><span>{item.name}</span><strong>{item.quantity}</strong></div>)}{dashboardQuery.data?.topEpis.length === 0 ? <p className="text-sm text-slate-500">Sem entregas no período.</p> : null}</div></div>{dashboardQuery.data?.canViewCosts ? <div className="rounded-2xl border border-slate-200 p-4"><h4 className="font-extrabold">Custo por setor ou unidade</h4><div className="mt-3 space-y-2">{dashboardQuery.data.costByScope.map((item) => <div key={item.name} className="flex justify-between text-sm"><span>{item.name}</span><strong>{currency.format(item.value)}</strong></div>)}{dashboardQuery.data.costByScope.length === 0 ? <p className="text-sm text-slate-500">Sem custos no período.</p> : null}</div></div> : null}</div>
      </section>

      {episQuery.isError ? <ErrorState error={episQuery.error as Error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="Itens cadastrados" value={String(data?.summary.registered ?? "—")} detail="Catálogo no escopo atual" /><MetricCard label="Unidades em estoque" value={data?.summary.stockTotal.toLocaleString("pt-BR") ?? "—"} detail="Saldo consolidado" tone="info" /><MetricCard label="Abaixo do mínimo" value={String(data?.summary.lowStock ?? "—")} detail="Reposição recomendada" tone="danger" /></div>

      <section className="card p-5">
        <SectionHeading title="Estoque de EPI" description="Listagem paginada e isolada por empresa/unidade" action={<div className="flex flex-wrap gap-2"><input className="input w-44" placeholder="Nome, CA ou categoria" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select className="select w-44" value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1); }}><option value="ALL">Todos os estoques</option><option value="LOW">Em alerta</option><option value="REGULAR">Regular</option></select>{canManage ? <Link className="btn-secondary" to="/epi">Gerenciar catálogo</Link> : null}</div>} />
        {episQuery.isLoading ? <LoadingState /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-3">EPI</th><th className="px-3 py-3">CA</th><th className="px-3 py-3">Estoque</th><th className="px-3 py-3">Mínimo</th>{data?.canViewCosts ? <th className="px-3 py-3">Preço atual</th> : null}<th className="px-3 py-3">Situação</th></tr></thead><tbody>{data?.items.map((epi) => <tr key={epi.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-3 py-4"><p className="font-extrabold text-slate-950">{epi.name}</p><p className="text-xs text-slate-500">{epi.category}</p></td><td className="px-3 py-4 font-semibold">{epi.ca}</td><td className="px-3 py-4 text-lg font-extrabold">{epi.stock} <span className="text-xs font-medium text-slate-500">{epi.unit}</span></td><td className="px-3 py-4">{epi.minimumStock}</td>{data.canViewCosts ? <td className="px-3 py-4">{epi.purchasePrice === null || epi.purchasePrice === undefined ? "—" : currency.format(epi.purchasePrice)}</td> : null}<td className="px-3 py-4"><StatusBadge tone={epi.stock <= epi.minimumStock ? "danger" : "success"}>{epi.stock <= epi.minimumStock ? "Em alerta" : "Regular"}</StatusBadge></td></tr>)}</tbody></table>{data?.items.length === 0 ? <EmptyState text="Nenhum EPI corresponde aos filtros selecionados." /> : null}</div>}
        <div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">{data?.total ?? 0} registro(s)</span><div className="flex gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="px-2 py-2.5 font-bold">{page} / {pageCount}</span><button className="btn-secondary" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
      </section>

      <section className="card p-5"><SectionHeading title="Movimentações recentes" description="Custos legados estimados são identificados separadamente" />{movementQuery.isLoading ? <LoadingState /> : movementQuery.data?.items.length ? <div className="space-y-2">{movementQuery.data.items.map((movement) => <div key={movement.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-extrabold">{movement.epi.name} · {movement.quantity} {movement.epi.unit}</p><p className="text-sm text-slate-500">{movement.employee.name} · {formatBrazilDateTime(movement.date)}</p></div><StatusBadge tone={movement.movementType === "DEVOLUCAO" ? "info" : movement.movementType === "SUBSTITUICAO" ? "warning" : "success"}>{movement.movementType}</StatusBadge>{movement.unitCostSnapshot && data?.canViewCosts ? <span className="text-sm font-bold">{currency.format(Number(movement.unitCostSnapshot))}{movement.isEstimatedCost ? " (estimado)" : ""}</span> : null}</div>)}</div> : <EmptyState text="Nenhuma movimentação registrada." />}</section>

      {showMovement ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Nova movimentação de EPI"><form className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); createMovement.mutate(); }}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Movimentação autenticada</p><h3 className="mt-1 text-xl font-extrabold">Nova movimentação</h3></div><button type="button" className="btn-secondary" onClick={() => setShowMovement(false)}>Fechar</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Tipo<select className="select mt-1" value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value })}><option value="ENTREGA">Entrega</option><option value="DEVOLUCAO">Devolução</option><option value="SUBSTITUICAO">Substituição</option></select></label><label className="text-xs font-bold text-slate-600">Quantidade<input className="input mt-1" type="number" value={form.quantity} min="1" onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Funcionário<select required className="select mt-1" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Selecione</option>{employeesQuery.data?.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.registration}</option>)}</select></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">EPI<select required className="select mt-1" value={form.epiId} onChange={(event) => setForm({ ...form, epiId: event.target.value })}><option value="">Selecione</option>{data?.items.map((epi) => <option key={epi.id} value={epi.id}>{epi.name} · saldo {epi.stock}</option>)}</select></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Motivo/observação<textarea className="textarea mt-1" value={form.movementReason} onChange={(event) => setForm({ ...form, movementReason: event.target.value })} /></label></div>{createMovement.isError ? <p className="mt-3 text-sm font-bold text-red-700">{(createMovement.error as Error).message}</p> : null}<button className="btn-primary mt-5 w-full" disabled={createMovement.isPending}>{createMovement.isPending ? "Salvando…" : "Confirmar movimentação"}</button></form></div> : null}
    </div>
  );
}

function LoadingState() { return <div className="animate-pulse py-12 text-center text-sm text-slate-500">Carregando…</div>; }
function EmptyState({ text }: { text: string }) { return <div className="py-12 text-center text-sm text-slate-500">{text}</div>; }
function ErrorState({ error }: { error: Error }) { return <div className="card border-red-200 bg-red-50 text-red-800"><strong>Não foi possível carregar os EPIs.</strong><p className="mt-1 text-sm">{error.message}</p></div>; }
