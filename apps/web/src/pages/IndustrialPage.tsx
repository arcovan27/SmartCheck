import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { apiRequest } from "../lib/api";

type Summary = {
  indicators: { openOrders: number; pendingDeliveries: number; curingLots: number; lossQuantity: string; lossCost: string; fuelLiters: string; fuelTotal: string };
  orders: Array<{ id: string; number: string; issueDate: string; status: string; total: string; customer: { legalName: string; tradeName?: string | null }; seller?: { email: string; employee?: { name: string } | null } | null; items: Array<{ id: string; code: string; description: string; requestedQuantity: string; deliveredQuantity: string; balance: string; total: string }> }>;
  deliveries: Array<{ id: string; plannedAt?: string | null; completedAt?: string | null; status: string; chargedAmount?: string | null; costAmount?: string | null; carrier?: string | null; order: { number: string; customer: { legalName: string; tradeName?: string | null } }; driver?: { name: string } | null; vehicle?: { name: string } | null; items: Array<{ plannedQuantity: string; deliveredQuantity: string }> }>;
  lots: Array<{ id: string; code: string; quantity: string; manufacturedAt: string; cureReleaseAt: string; status: string; product: { code: string; description: string } }>;
  opportunities: Array<{ id: string; title: string; status: string; estimatedValue?: string | null; nextContactAt?: string | null; customer: { legalName: string; tradeName?: string | null }; stage: { name: string; color?: string | null }; responsible: { email: string; employee?: { name: string } | null } }>;
};

const money = (value: string | number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "—";
const status = (value: string) => value.replaceAll("_", " ");

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{text}</div>; }

export function IndustrialPage() {
  const { pathname } = useLocation();
  const summary = useQuery({ queryKey: ["industrial-summary"], queryFn: () => apiRequest<Summary>("/industrial/summary"), refetchInterval: 30000 });
  if (summary.isLoading) return <div className="card">Carregando dados integrados...</div>;
  if (summary.isError || !summary.data) return <div className="card text-red-700">Não foi possível carregar este módulo. Verifique sua permissão e tente novamente.</div>;
  const data = summary.data;
  const title = pathname.includes("crm") ? "CRM" : pathname.includes("fretes") ? "Relação de Fretes" : pathname.includes("diesel") ? "Abastecimento de Diesel" : pathname.includes("produto-acabado") ? "Produto Acabado" : pathname.includes("producao") ? "Produção, Perdas e Qualidade" : pathname.includes("pedidos") ? "Pedidos Fechados" : "Relação de Vendas";
  const showDeliveries = pathname.includes("fretes");
  const showLots = pathname.includes("produto-acabado") || pathname.includes("producao");
  const showCrm = pathname.includes("crm");
  const showFuel = pathname.includes("diesel");
  const showOrders = !showDeliveries && !showLots && !showCrm && !showFuel;

  return <div className="space-y-6">
    <header className="card bg-slate-950 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Arcovan · fluxo integrado</p><h2 className="mt-2 text-3xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-slate-300">Dados reais e rastreáveis da operação industrial.</p></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Pedidos em aberto', data.indicators.openOrders], ['Fretes pendentes', data.indicators.pendingDeliveries], ['Lotes em cura/inspeção', data.indicators.curingLots], ['Custo de perdas', money(data.indicators.lossCost)]].map(([label, value]) => <div className="card" key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-extrabold text-brand-700">{value}</p></div>)}
    </div>

    {showOrders ? <section className="card overflow-x-auto"><div className="mb-4 flex items-center justify-between"><h3 className="section-title">Pedidos e saldos</h3><Link className="btn-primary" to="/orcamentos">Abrir orçamentos</Link></div>{data.orders.length === 0 ? <Empty text="Nenhum pedido fechado encontrado." /> : <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-3">Pedido</th><th>Cliente</th><th>Emissão</th><th>Vendedor</th><th>Status</th><th className="text-right">Vendido</th><th className="text-right">Saldo em itens</th></tr></thead><tbody>{data.orders.map((order) => <tr className="border-b" key={order.id}><td className="p-3 font-bold">{order.number}</td><td>{order.customer.tradeName || order.customer.legalName}</td><td>{date(order.issueDate)}</td><td>{order.seller?.employee?.name || order.seller?.email || "—"}</td><td><span className="badge">{status(order.status)}</span></td><td className="text-right font-bold">{money(order.total)}</td><td className="text-right">{order.items.reduce((sum, item) => sum + Number(item.balance), 0)}</td></tr>)}</tbody></table>}</section> : null}

    {showDeliveries ? <section className="card overflow-x-auto"><h3 className="section-title mb-4">Entregas pendentes, em andamento e concluídas</h3>{data.deliveries.length === 0 ? <Empty text="Nenhuma entrega programada." /> : <table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-3">Pedido</th><th>Cliente</th><th>Prevista</th><th>Motorista / veículo</th><th>Status</th><th className="text-right">Programado</th><th className="text-right">Entregue</th><th className="text-right">Resultado frete</th></tr></thead><tbody>{data.deliveries.map((delivery) => <tr className="border-b" key={delivery.id}><td className="p-3 font-bold">{delivery.order.number}</td><td>{delivery.order.customer.tradeName || delivery.order.customer.legalName}</td><td>{date(delivery.plannedAt)}</td><td>{delivery.driver?.name || delivery.carrier || "—"} / {delivery.vehicle?.name || "—"}</td><td><span className="badge">{status(delivery.status)}</span></td><td className="text-right">{delivery.items.reduce((sum, item) => sum + Number(item.plannedQuantity), 0)}</td><td className="text-right">{delivery.items.reduce((sum, item) => sum + Number(item.deliveredQuantity), 0)}</td><td className="text-right font-bold">{money(Number(delivery.chargedAmount ?? 0) - Number(delivery.costAmount ?? 0))}</td></tr>)}</tbody></table>}</section> : null}

    {showLots ? <section className="card overflow-x-auto"><h3 className="section-title mb-4">Lotes separados do estoque disponível</h3>{data.lots.length === 0 ? <Empty text="Nenhum lote de produção registrado." /> : <table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-3">Lote</th><th>Produto</th><th>Produzido em</th><th>Previsão de liberação</th><th>Quantidade</th><th>Status</th></tr></thead><tbody>{data.lots.map((lot) => <tr className="border-b" key={lot.id}><td className="p-3 font-bold">{lot.code}</td><td>{lot.product.code} · {lot.product.description}</td><td>{date(lot.manufacturedAt)}</td><td>{date(lot.cureReleaseAt)}</td><td>{lot.quantity}</td><td><span className="badge">{status(lot.status)}</span></td></tr>)}</tbody></table>}</section> : null}

    {showCrm ? <section className="card"><h3 className="section-title mb-4">Funil configurável</h3>{data.opportunities.length === 0 ? <Empty text="Nenhuma oportunidade cadastrada." /> : <div className="grid gap-4 lg:grid-cols-3">{data.opportunities.map((opportunity) => <article key={opportunity.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-2"><span className="badge" style={{ borderColor: opportunity.stage.color || undefined }}>{opportunity.stage.name}</span><span className="text-xs font-bold">{status(opportunity.status)}</span></div><h4 className="mt-3 font-extrabold">{opportunity.title}</h4><p className="text-sm text-slate-600">{opportunity.customer.tradeName || opportunity.customer.legalName}</p><p className="mt-3 font-bold text-brand-700">{money(opportunity.estimatedValue)}</p><p className="mt-2 text-xs text-slate-500">Próximo contato: {date(opportunity.nextContactAt)} · {opportunity.responsible.employee?.name || opportunity.responsible.email}</p></article>)}</div>}</section> : null}

    {showFuel ? <section className="card"><h3 className="section-title">Resumo de abastecimento</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-5"><p className="text-sm text-slate-500">Litros no período</p><p className="text-3xl font-extrabold">{data.indicators.fuelLiters}</p></div><div className="rounded-2xl bg-slate-50 p-5"><p className="text-sm text-slate-500">Valor total</p><p className="text-3xl font-extrabold">{money(data.indicators.fuelTotal)}</p></div></div></section> : null}
  </div>;
}
