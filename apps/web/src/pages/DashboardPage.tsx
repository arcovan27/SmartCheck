import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

type DashboardResponse = {
  cards: {
    activeEmployees: number;
    totalEpis: number;
    lowStockEpis: number;
    activeEquipments: number;
    openMaintenances: number;
    pendingChecklists: number;
    duePreventiveAlerts: number;
  };
};

type CardItem = {
  label: string;
  value: number;
  tone: string;
  to?: string;
  helper?: string;
};

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiRequest<DashboardResponse>("/dashboard/summary")
  });

  if (summaryQuery.isLoading) {
    return <div className="card">Carregando dashboard...</div>;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <div className="card text-red-700">Falha ao carregar o dashboard.</div>;
  }

  const { cards } = summaryQuery.data;

  const cardItems: CardItem[] = [
    { label: "Funcionarios Ativos", value: cards.activeEmployees, tone: "text-cyan-700" },
    { label: "EPIs Cadastrados", value: cards.totalEpis, tone: "text-cyan-700" },
    {
      label: "EPIs em Estoque Minimo",
      value: cards.lowStockEpis,
      tone: cards.lowStockEpis > 0 ? "text-red-700" : "text-emerald-700",
      to: "/epi?filtro=estoque-minimo",
      helper: cards.lowStockEpis > 0 ? "Clique para ver os EPIs em alerta" : "Sem alertas"
    },
    { label: "Equipamentos Ativos", value: cards.activeEquipments, tone: "text-cyan-700" },
    { label: "Manutencoes em Aberto", value: cards.openMaintenances, tone: "text-red-700" },
    { label: "Checklists Pendentes", value: cards.pendingChecklists, tone: "text-amber-700" },
    { label: "Alertas Preventivos", value: cards.duePreventiveAlerts, tone: "text-orange-700" }
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="section-title">Cards</h3>
          <p className="text-sm text-slate-500">Resumo geral da operacao industrial.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cardItems.map((item) => {
            const content = (
              <div className="card rounded-[24px] border-slate-200 bg-white/95 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <p className={`mt-3 text-4xl font-extrabold tracking-tight ${item.tone}`}>{item.value}</p>
                {item.helper && <p className="mt-2 text-xs text-slate-500">{item.helper}</p>}
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
    </div>
  );
}
