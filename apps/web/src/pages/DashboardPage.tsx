import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { visualFeatures } from "../config/visualFeatures";
import { areaColors, type BusinessArea } from "../components/BrandIdentity";

type DashboardResponse = {
  cards: {
    activeEmployees: number;
    totalEpis: number;
    lowStockEpis: number;
    activeEquipments: number;
    openMaintenances: number;
    pendingChecklists: number;
    employeeOccurrences: number | null;
    ddsExecutions: number;
    quotesCreated: number;
    salesOrders: number;
    deliveries: number;
    qualityEntries: number;
    inventoryCounts: number;
  };
  hrNotices: Array<{ id: string; title: string; message: string; priority: "NORMAL" | "IMPORTANTE" | "URGENTE"; startsAt: string; endsAt: string; audience?: string | null; author: { email: string; employee?: { name: string } | null } }>;
  modules?: {
    purchases: null | { pendingRequests: number; awaitingApproval: number; awaitingDelivery: number; receiptDivergences: number; fiscalPending: number };
    finance: null | { dueToday: number | string; dueNextDays: number | string; overdue: number | string; awaitingApproval: number; paidInPeriod: number | string };
  };
  sectionErrors?: string[];
  recentMaintenances?: Array<{ id: string; number?: number | null; description: string; status: string; priority?: string; equipment?: { name: string } | null }>;
  recentChecklistProblems?: Array<{ id: string; executedAt: string; template: { name: string }; equipment?: { name: string } | null }>;
  recentEpiDeliveries?: Array<{ id: string; date: string; employee: { name: string }; epi: { name: string } }>;
};

type CardItem = {
  label: string;
  value: number;
  tone: string;
  to?: string;
  isAlert?: boolean;
};

function LegacyDashboardPage() {
  const [from, setFrom] = useState(() => `${new Date().toISOString().slice(0, 7)}-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", from, to],
    queryFn: () => apiRequest<DashboardResponse>(`/dashboard/summary?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`),
    refetchInterval: 30000,
    refetchIntervalInBackground: true
  });

  if (summaryQuery.isLoading) {
    return <div className="card">Carregando dashboard...</div>;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <div className="card text-red-700">Falha ao carregar o dashboard.</div>;
  }

  const { cards } = summaryQuery.data;

  const cardItems: CardItem[] = [
    { label: "Funcionarios Ativos", value: cards.activeEmployees, tone: "text-cyan-700", to: "/funcionarios" },
    { label: "EPIs Cadastrados", value: cards.totalEpis, tone: "text-cyan-700", to: "/epi" },
    {
      label: "EPIs em Estoque Minimo",
      value: cards.lowStockEpis,
      tone: cards.lowStockEpis > 0 ? "text-red-700" : "text-emerald-700",
      to: "/epi?filtro=estoque-minimo",
      isAlert: true
    },
    { label: "Equipamentos Ativos", value: cards.activeEquipments, tone: "text-cyan-700", to: "/equipamentos" },
    ...(cards.employeeOccurrences === null ? [] : [{ label: "Ocorrências de Funcionários", value: cards.employeeOccurrences, tone: "text-amber-700", to: "/recursos-humanos/indicadores-ocorrencias" }]),
    { label: "DDS realizados", value: cards.ddsExecutions, tone: "text-teal-700", to: "/seguranca-pessoas/historico" },
    { label: "Orçamentos criados", value: cards.quotesCreated, tone: "text-cyan-700", to: "/orcamentos" },
    { label: "Pedidos de venda", value: cards.salesOrders, tone: "text-cyan-700", to: "/forca-vendas/pedidos" },
    { label: "Entregas", value: cards.deliveries, tone: "text-cyan-700", to: "/expedicao/fretes" },
    { label: "Lançamentos de qualidade", value: cards.qualityEntries, tone: "text-amber-700", to: "/estoque/lancamentos" },
    { label: "Inventários", value: cards.inventoryCounts, tone: "text-cyan-700", to: "/estoque/inventario" },
    { label: "Manutencoes em Aberto", value: cards.openMaintenances, tone: "text-red-700", to: "/manutencao" },
    {
      label: "Checklists Pendentes",
      value: cards.pendingChecklists,
      tone: "text-amber-700",
      to: "/operacao-arcovan/checklists?filtro=pendentes"
    }
  ];

  return (
    <div className="space-y-6">
      <header className="card bg-slate-950 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">SmartCheck</p><h1 className="mt-2 text-3xl font-extrabold">Gestão Arcovan</h1><p className="mt-2 text-sm text-slate-300">Indicadores gerenciais consolidados de todos os módulos.</p></header>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
          <h3 className="section-title">Cards</h3>
          <p className="text-sm text-slate-500">Resumo geral da operacao industrial.</p>
          </div>
          <div className="flex gap-2"><label className="text-xs font-bold">De<input className="input mt-1" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-bold">Até<input className="input mt-1" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cardItems.map((item) => {
            const content = (
              <div
                className={`card rounded-[24px] border-slate-200 bg-white/95 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${
                  item.isAlert && item.value > 0 ? "ring-1 ring-red-200" : ""
                }`}
              >
                <div className="flex min-h-[112px] flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    {item.isAlert && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          item.value > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.value > 0 ? "Em alerta" : "Normal"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <p className={`text-4xl font-extrabold tracking-tight ${item.tone}`}>{item.value}</p>
                    {item.to && <p className="text-xs font-medium text-slate-400">Clique para abrir</p>}
                  </div>
                </div>
              </div>
            );

            if (!item.to) return <div key={item.label}>{content}</div>;

            return (
              <Link key={item.label} to={item.to} className="block transition hover:-translate-y-0.5">
                {content}
              </Link>
            );
          })}
        </div>
      </section>
      {summaryQuery.data.hrNotices.length > 0 ? <section className="card">
        <div><h3 className="section-title">Avisos de Recursos Humanos</h3><p className="text-sm text-slate-500">Comunicados ativos, priorizados por urgência.</p></div>
        <div className="mt-4 grid gap-3">{summaryQuery.data.hrNotices.map((notice) => <article key={notice.id} className={`rounded-2xl border p-4 ${notice.priority === "URGENTE" ? "border-red-300 bg-red-50" : notice.priority === "IMPORTANTE" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-extrabold">{notice.title}</h4><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{notice.priority}</span></div><p className="mt-2 text-sm text-slate-700">{notice.message}</p><p className="mt-2 text-xs text-slate-500">{notice.audience || "Todos"} · {notice.author.employee?.name || notice.author.email}</p></article>)}</div>
      </section> : null}
    </div>
  );
}

type ExecutiveKpi = { label: string; value: string | number; detail: string; area: BusinessArea; to?: string; alert?: boolean };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function DashboardSkeleton() {
  return <div className="space-y-6" aria-label="Carregando dashboard"><div className="smartcheck-skeleton h-36 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="smartcheck-skeleton h-32 rounded-2xl" />)}</div><div className="grid gap-4 lg:grid-cols-2"><div className="smartcheck-skeleton h-72 rounded-2xl" /><div className="smartcheck-skeleton h-72 rounded-2xl" /></div></div>;
}

function KpiCard({ item }: { item: ExecutiveKpi }) {
  const colors = areaColors(item.area); const content = <article className={`group h-full rounded-2xl border bg-white p-4 shadow-[var(--smartcheck-shadow-card)] transition ${item.alert ? "border-rose-200" : "border-slate-200"} ${item.to ? "hover:-translate-y-0.5 hover:shadow-[var(--smartcheck-shadow-elevated)]" : ""}`} title={item.detail}><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-black" style={{ color: colors.accent, backgroundColor: colors.soft }} aria-hidden="true">●</span>{item.alert ? <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">Atenção</span> : null}</div><p className="mt-4 text-xs font-bold uppercase tracking-[.08em] text-slate-500">{item.label}</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-[#0b2341]">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></article>;
  return item.to ? <Link to={item.to} className="block h-full rounded-2xl focus-visible:outline-offset-4">{content}</Link> : content;
}

function ExecutiveDashboardPage() {
  const { user } = useAuth(); const today = new Date();
  const [from, setFrom] = useState(() => `${today.toISOString().slice(0, 7)}-01`); const [to, setTo] = useState(() => today.toISOString().slice(0, 10));
  const summary = useQuery({ queryKey: ["dashboard-executive", from, to], queryFn: ({ signal }) => apiRequest<DashboardResponse>(`/dashboard/summary?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`, { signal }), staleTime: 30_000, refetchInterval: 60_000 });
  if (summary.isLoading) return <DashboardSkeleton />;
  if (summary.isError || !summary.data) return <section className="card border-rose-200 bg-rose-50" role="alert"><h1 className="text-xl font-extrabold text-rose-900">Não foi possível carregar a visão executiva</h1><p className="mt-1 text-sm text-rose-700">Os demais módulos continuam disponíveis pelo menu.</p><button className="btn-primary mt-4" onClick={() => summary.refetch()}>Tentar novamente</button></section>;
  const data = summary.data; const { cards } = data; const purchases = data.modules?.purchases; const finance = data.modules?.finance;
  const kpis: ExecutiveKpi[] = [
    { label: "Checklists pendentes", value: cards.pendingChecklists, detail: "Rotinas ainda não executadas", area: "operation", to: "/operacao-arcovan/checklists?filtro=pendentes", alert: cards.pendingChecklists > 0 },
    { label: "Manutenções abertas", value: cards.openMaintenances, detail: "Ordens que exigem acompanhamento", area: "maintenance", to: "/manutencao", alert: cards.openMaintenances > 0 },
    { label: "Estoque mínimo", value: cards.lowStockEpis, detail: "EPIs no mínimo ou abaixo", area: "people", to: "/recursos-humanos/epi", alert: cards.lowStockEpis > 0 },
    { label: "Orçamentos", value: cards.quotesCreated, detail: "Criados no período selecionado", area: "commercial", to: "/orcamentos" },
    ...(purchases ? [{ label: "Compras pendentes", value: purchases.pendingRequests, detail: "Solicitações em cotação", area: "purchases" as const, to: "/compras", alert: purchases.pendingRequests > 0 }, { label: "Aprovações de compra", value: purchases.awaitingApproval, detail: "Decisões aguardando responsável", area: "purchases" as const, to: "/compras/aprovacoes", alert: purchases.awaitingApproval > 0 }, { label: "OCs aguardando entrega", value: purchases.awaitingDelivery, detail: "Ordens ainda não concluídas", area: "purchases" as const, to: "/compras/ordens" }, { label: "Divergências fiscais/físicas", value: purchases.receiptDivergences + purchases.fiscalPending, detail: "Pendências de recebimento ou nota", area: "purchases" as const, to: "/compras/recebimentos", alert: purchases.receiptDivergences + purchases.fiscalPending > 0 }] : []),
    ...(finance ? [{ label: "A pagar hoje", value: currency.format(Number(finance.dueToday)), detail: "Saldo com vencimento hoje", area: "finance" as const, to: "/financeiro/contas-a-pagar" }, { label: "Títulos vencidos", value: currency.format(Number(finance.overdue)), detail: "Saldo vencido e ainda aberto", area: "finance" as const, to: "/financeiro/contas-a-pagar?status=VENCIDA", alert: Number(finance.overdue) > 0 }, { label: "Autorizações de pagamento", value: finance.awaitingApproval, detail: "Títulos aguardando alçada", area: "finance" as const, to: "/financeiro/contas-a-pagar?status=AGUARDANDO_APROVACAO", alert: finance.awaitingApproval > 0 }, { label: "Pago no período", value: currency.format(Number(finance.paidInPeriod)), detail: "Pagamentos registrados e não estornados", area: "finance" as const, to: "/financeiro/pagamentos" }] : [])
  ];
  const composition = [{ label: "Pedidos", value: cards.salesOrders, area: "commercial" as const }, { label: "Entregas", value: cards.deliveries, area: "inventory" as const }, { label: "Qualidade", value: cards.qualityEntries, area: "operation" as const }, { label: "Inventários", value: cards.inventoryCounts, area: "inventory" as const }, { label: "DDS", value: cards.ddsExecutions, area: "people" as const }]; const compositionMax = Math.max(1, ...composition.map((item) => item.value));
  const firstName = (user?.employee?.name ?? user?.email ?? "").split(" ")[0]; const lastUpdate = new Date(summary.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return <div className="space-y-6 pb-8">
    <section className="overflow-hidden rounded-2xl bg-[#0b2341] p-5 text-white shadow-[var(--smartcheck-shadow-elevated)] md:p-7"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Visão executiva</p><h1 className="mt-2 text-2xl font-extrabold md:text-3xl">Olá, {firstName}</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Prioridades operacionais e financeiras consolidadas com dados reais do SmartCheck.</p></div><div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-right"><p className="text-xs text-slate-400">Última atualização</p><p className="font-bold">{lastUpdate}</p></div></div><div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 md:flex-row md:items-end md:justify-between"><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-300">De<input className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white [color-scheme:dark]" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-bold text-slate-300">Até<input className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white [color-scheme:dark]" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div><button className="min-h-11 rounded-xl bg-cyan-400 px-5 text-sm font-extrabold text-[#071b38] hover:bg-cyan-300 disabled:opacity-60" disabled={summary.isFetching} onClick={() => summary.refetch()}>{summary.isFetching ? "Atualizando…" : "Atualizar dados"}</button></div></section>
    {data.sectionErrors?.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status"><strong>Algumas áreas não responderam.</strong> Os indicadores disponíveis continuam válidos. <button className="font-bold underline" onClick={() => summary.refetch()}>Tentar novamente</button></section> : null}
    <section aria-labelledby="priority-kpis"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="priority-kpis" className="text-lg font-extrabold text-[#0b2341]">O que precisa de atenção</h2><p className="text-sm text-slate-500">Selecione um card para abrir a área relacionada.</p></div><span className="hidden text-xs font-semibold text-slate-400 sm:block">{from.split("-").reverse().join("/")} — {to.split("-").reverse().join("/")}</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((item) => <KpiCard key={item.label} item={item} />)}</div></section>
    <div className="grid gap-4 lg:grid-cols-[1.15fr,.85fr]"><section className="card p-5"><div><h2 className="text-lg font-extrabold text-[#0b2341]">Composição operacional</h2><p className="text-sm text-slate-500">Volume registrado por frente no período.</p></div><div className="mt-6 space-y-5">{composition.map((item) => { const colors = areaColors(item.area); return <div key={item.label}><div className="mb-2 flex justify-between text-sm"><span className="font-semibold text-slate-600">{item.label}</span><strong className="text-[#0b2341]">{item.value}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(item.value ? 6 : 0, item.value / compositionMax * 100)}%`, backgroundColor: colors.accent }} /></div></div>; })}</div></section><section className="card p-5"><div><h2 className="text-lg font-extrabold text-[#0b2341]">Pendências prioritárias</h2><p className="text-sm text-slate-500">Ocorrências recentes que merecem análise.</p></div><div className="mt-4 space-y-3">{data.recentChecklistProblems?.slice(0, 4).map((problem) => <Link to="/gestao-arcovan/historico-checklist" key={problem.id} className="block rounded-xl border border-amber-100 bg-amber-50 p-3 hover:border-amber-300"><p className="text-sm font-bold text-amber-950">Checklist com apontamento</p><p className="mt-1 text-xs text-amber-800">{problem.template.name}{problem.equipment?.name ? ` · ${problem.equipment.name}` : ""}</p></Link>)}{!data.recentChecklistProblems?.length ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhum apontamento recente de checklist.</div> : null}</div></section></div>
    <div className="grid gap-4 lg:grid-cols-2"><section className="card p-5"><h2 className="text-lg font-extrabold text-[#0b2341]">Atividade de manutenção</h2><div className="mt-4 divide-y divide-slate-100">{data.recentMaintenances?.map((item) => <Link to="/manutencao" key={item.id} className="flex min-h-14 items-center justify-between gap-3 py-3 hover:text-sky-700"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.description}</p><p className="truncate text-xs text-slate-500">{item.equipment?.name ?? "Sem equipamento"}</p></div><span className="badge-neutral shrink-0">{item.status}</span></Link>)}</div></section><section className="card p-5"><h2 className="text-lg font-extrabold text-[#0b2341]">Avisos corporativos</h2><div className="mt-4 space-y-3">{data.hrNotices.slice(0, 4).map((notice) => <article key={notice.id} className={`rounded-xl border p-3 ${notice.priority === "URGENTE" ? "border-rose-200 bg-rose-50" : notice.priority === "IMPORTANTE" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><div className="flex justify-between gap-3"><h3 className="text-sm font-bold">{notice.title}</h3><span className="text-[10px] font-black uppercase tracking-wide">{notice.priority}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-600">{notice.message}</p></article>)}{!data.hrNotices.length ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhum aviso ativo para o período.</div> : null}</div></section></div>
  </div>;
}

export function DashboardPage() { return visualFeatures.adminShellV2Enabled ? <ExecutiveDashboardPage /> : <LegacyDashboardPage />; }
