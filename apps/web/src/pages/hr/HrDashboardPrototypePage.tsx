import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { formatBrazilDateTime, toBrazilDateInputValue } from "../../lib/datetime";
import { HrPageHeader, HrSectionTabs, MetricCard, SectionHeading, StatusBadge } from "./HrPrototypeComponents";
import { hrFeatures } from "../../config/hrFeatures";

type FilterOption = { id: string; name?: string; legalName?: string; tradeName?: string; registration?: string; companyId?: string; unitId?: string };
type DashboardFilters = {
  companies: FilterOption[];
  units: FilterOption[];
  departments: FilterOption[];
  positions: FilterOption[];
  teams: FilterOption[];
  shifts: FilterOption[];
  employees: FilterOption[];
  epiCategories: string[];
  absenceReasons: Array<FilterOption & { occurrenceType: string }>;
};
type DashboardData = {
  employees: { active: number; admitted: number; dismissed: number; away: number; byDepartment: Array<{ name: string; value: number }> };
  epi: { registered: number; stockTotal: number; lowStock: number; delivered: number; returned: number; substituted: number; expiring: number; expired: number };
  costs: null | { exactCost: number; estimatedLegacyCost: number; previousCost: number; variationPercent: number | null; monthly: Array<{ month: string; exactCost: number; estimatedLegacyCost: number }> };
  schedules: { activeNow: number; hoursPlanned: number; upcoming: Array<{ id: string; startAt: string; endAt: string; employee: { name: string }; team?: { name: string } | null; shift?: { name: string } | null }> };
  occurrences: { total: number; justified: number; notJustified: number; medicalCertificates: number; affectedEmployees: number; absentScheduledHours: number; absenteeismPercent: number | null };
};

const initialFilters = {
  startDate: toBrazilDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  endDate: toBrazilDateInputValue(),
  companyId: "",
  unitId: "",
  departmentId: "",
  positionId: "",
  employeeId: "",
  teamId: "",
  shiftId: "",
  epiCategory: "",
  occurrenceType: "",
  occurrenceStatus: ""
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function HrDashboardPrototypePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(initialFilters).map(([key, value]) => [key, searchParams.get(key) ?? value])) as typeof initialFilters);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const filtersQuery = useQuery({ queryKey: ["hr-dashboard-filters"], queryFn: () => apiRequest<DashboardFilters>("/hr/dashboard/filters") });
  const dashboardQuery = useQuery({
    queryKey: ["hr-dashboard", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("startDate", filters.startDate);
      params.set("endDate", filters.endDate);
      for (const [key, value] of Object.entries(filters)) if (value && key !== "startDate" && key !== "endDate") params.set(key, value);
      return apiRequest<DashboardData>(`/hr/dashboard?${params.toString()}`);
    }
  });
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);
  const data = dashboardQuery.data;
  const options = filtersQuery.data;
  const activeFilters = Object.entries(filters).filter(([key, value]) => value && !["startDate", "endDate"].includes(key));
  const maxDepartment = Math.max(1, ...(data?.employees.byDepartment.map((item) => item.value) ?? [1]));
  const maxCost = Math.max(1, ...(data?.costs?.monthly.map((item) => item.exactCost + item.estimatedLegacyCost) ?? [1]));
  const occurrenceParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !["epiCategory", "occurrenceStatus"].includes(key)) occurrenceParams.set(key, value);

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <HrPageHeader eyebrow="Recursos Humanos" title="Visão geral de pessoas e segurança" description="Quadro, ocorrências, EPI e custos consolidados dentro do escopo autorizado. Detalhes clínicos não são exibidos." />

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-950">Filtros globais</p><p className="text-xs text-slate-500">Todos os indicadores compatíveis acompanham esta seleção.</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => setShowMoreFilters((value) => !value)}>{showMoreFilters ? "Menos filtros" : "Mais filtros"}</button><button className="btn-secondary" onClick={() => setFilters(initialFilters)} disabled={activeFilters.length === 0}>Limpar</button></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-bold text-slate-600">De<input className="input mt-1" type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label>
          <label className="text-xs font-bold text-slate-600">Até<input className="input mt-1" type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label>
          <FilterSelect label="Empresa" value={filters.companyId} onChange={(companyId) => setFilters({ ...filters, companyId, unitId: "" })} options={options?.companies ?? []} emptyLabel="Todas as empresas" getLabel={(item) => item.tradeName || item.legalName || "Empresa"} />
          <FilterSelect label="Unidade" value={filters.unitId} onChange={(unitId) => setFilters({ ...filters, unitId })} options={(options?.units ?? []).filter((item) => !filters.companyId || item.companyId === filters.companyId)} emptyLabel="Todas as unidades" />
          <FilterSelect label="Setor" value={filters.departmentId} onChange={(departmentId) => setFilters({ ...filters, departmentId })} options={(options?.departments ?? []).filter((item) => !filters.companyId || item.companyId === filters.companyId)} emptyLabel="Todos os setores" />
          <FilterSelect label="Funcionário" value={filters.employeeId} onChange={(employeeId) => setFilters({ ...filters, employeeId })} options={options?.employees ?? []} emptyLabel="Todos os funcionários" getLabel={(item) => `${item.name} · ${item.registration}`} />
        </div>
        {showMoreFilters ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><PlainSelect value={filters.positionId} onChange={(positionId) => setFilters({ ...filters, positionId })} options={options?.positions ?? []} emptyLabel="Todos os cargos" /><PlainSelect value={filters.teamId} onChange={(teamId) => setFilters({ ...filters, teamId })} options={options?.teams ?? []} emptyLabel="Todas as equipes" /><PlainSelect value={filters.shiftId} onChange={(shiftId) => setFilters({ ...filters, shiftId })} options={options?.shifts ?? []} emptyLabel="Todos os turnos" /><select className="select" value={filters.epiCategory} onChange={(event) => setFilters({ ...filters, epiCategory: event.target.value })}><option value="">Todos os tipos de EPI</option>{options?.epiCategories.map((category) => <option key={category}>{category}</option>)}</select><select className="select" value={filters.occurrenceStatus} onChange={(event) => setFilters({ ...filters, occurrenceStatus: event.target.value })}><option value="">Todos os status de ocorrência</option><option value="PENDENTE">Pendente</option><option value="EM_ANALISE">Em análise</option><option value="APROVADO">Aprovado</option><option value="REJEITADO">Rejeitado</option></select></div> : null}
        {activeFilters.length ? <div className="mt-3 flex flex-wrap gap-2">{activeFilters.map(([key]) => <span key={key} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">{filterLabel(key)}</span>)}</div> : null}
      </section>

      {dashboardQuery.isLoading ? <div className="card animate-pulse py-16 text-center text-sm text-slate-500">Carregando indicadores de Recursos Humanos…</div> : null}
      {dashboardQuery.isError ? <div className="card border-red-200 bg-red-50 text-red-800"><strong>Não foi possível carregar o dashboard.</strong><p className="mt-1 text-sm">{(dashboardQuery.error as Error).message}</p></div> : null}
      {data ? <>
        <section><SectionHeading title="Pulso do RH" description="Indicadores atualizados para o período e escopo selecionados" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Funcionários ativos" value={String(data.employees.active)} detail={`${data.employees.admitted} admissões · ${data.employees.dismissed} desligamentos`} to="/recursos-humanos/funcionarios" />{hrFeatures.workScheduleEnabled ? <MetricCard label="Escalados no período" value={String(data.schedules.activeNow)} detail={`${data.schedules.hoursPlanned.toFixed(1)} horas previstas no período`} tone="info" to="/recursos-humanos/escalas" /> : null}<MetricCard label="Ocorrências" value={String(data.occurrences.total)} detail={`${data.occurrences.justified} justificadas · ${data.occurrences.notJustified} não justificadas`} tone="warning" to={`/recursos-humanos/indicadores-ocorrencias?${occurrenceParams.toString()}`} /><MetricCard label="Alertas de EPI" value={String(data.epi.lowStock + data.epi.expired)} detail={`${data.epi.lowStock} estoque · ${data.epi.expired} vencidos`} tone="danger" to="/recursos-humanos/epi" /></div></section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr,1fr]">
          <div className="card p-5"><SectionHeading title="Evolução do custo de EPI" description={data.costs ? "Custo confirmado; legado estimado exibido separadamente" : "Valores restritos para este perfil"} action={data.costs?.variationPercent !== null && data.costs?.variationPercent !== undefined ? <StatusBadge tone={data.costs.variationPercent <= 0 ? "success" : "warning"}>{data.costs.variationPercent > 0 ? "+" : ""}{data.costs.variationPercent.toFixed(1)}%</StatusBadge> : undefined} />{data.costs ? <><div className="mb-4 flex flex-wrap gap-4 text-sm"><span><strong>{money(data.costs.exactCost)}</strong> confirmado</span>{data.costs.estimatedLegacyCost > 0 ? <span className="text-amber-700"><strong>{money(data.costs.estimatedLegacyCost)}</strong> legado estimado</span> : null}</div><div className="flex h-52 items-end gap-3 border-b border-slate-200 px-1 pb-2">{data.costs.monthly.length ? data.costs.monthly.map((item) => <div key={item.month} className="flex h-full flex-1 flex-col justify-end gap-2 text-center"><span className="text-[11px] font-bold text-slate-500">{money(item.exactCost)}</span><div className="min-h-1 rounded-t-lg bg-gradient-to-t from-brand-800 to-brand-400" style={{ height: `${((item.exactCost + item.estimatedLegacyCost) / maxCost) * 100}%` }} /><span className="text-xs font-bold text-slate-500">{new Date(item.month).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })}</span></div>) : <EmptyState text="Sem custos registrados no período." />}</div></> : <EmptyState text="Você não possui permissão para visualizar custos de EPI." />}</div>
          <div className="card p-5"><SectionHeading title="Quadro por setor" description="Funcionários ativos" /><div className="space-y-4">{data.employees.byDepartment.length ? data.employees.byDepartment.map((item) => <div key={item.name}><div className="mb-1.5 flex justify-between text-sm"><span className="font-bold text-slate-700">{item.name}</span><span className="text-slate-500">{item.value}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-700" style={{ width: `${(item.value / maxDepartment) * 100}%` }} /></div></div>) : <EmptyState text="Sem funcionários para os filtros selecionados." />}</div></div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2"><div className="card p-5"><SectionHeading title="EPI no período" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[["Estoque", data.epi.stockTotal], ["Entregues", data.epi.delivered], ["Devolvidos", data.epi.returned], ["Substituídos", data.epi.substituted], ["A vencer", data.epi.expiring], ["Vencidos", data.epi.expired]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-extrabold">{value}</p><p className="text-xs font-bold text-slate-500">{label}</p></div>)}</div></div>{hrFeatures.workScheduleEnabled ? <div className="card p-5"><SectionHeading title="Próximos turnos" description="Sem dados médicos ou sensíveis" />{data.schedules.upcoming.length ? <div className="space-y-3">{data.schedules.upcoming.map((turn) => <div key={turn.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-3"><span className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold text-white">{formatBrazilDateTime(turn.startAt)}</span><div className="min-w-0 flex-1"><p className="truncate font-extrabold">{turn.employee.name}</p><p className="text-sm text-slate-500">{turn.shift?.name || turn.team?.name || "Escala individual"}</p></div></div>)}</div> : <EmptyState text="Nenhum próximo turno para os filtros selecionados." />}</div> : null}</section>

        <section className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-sm font-bold text-slate-500">Atestados</p><p className="mt-2 text-3xl font-extrabold">{data.occurrences.medicalCertificates}</p></div><div className="card p-5"><p className="text-sm font-bold text-slate-500">Funcionários afetados</p><p className="mt-2 text-3xl font-extrabold">{data.occurrences.affectedEmployees}</p></div><div className="card p-5"><p className="text-sm font-bold text-slate-500">Absenteísmo</p><p className="mt-2 text-3xl font-extrabold">{data.occurrences.absenteeismPercent === null ? "Sem base" : `${data.occurrences.absenteeismPercent.toFixed(1)}%`}</p><p className="mt-1 text-xs text-slate-500">Ausência aprovada ÷ horas previstas</p></div></section>
        <div className="flex justify-end"><Link className="btn-secondary" to="/recursos-humanos/funcionarios">Abrir detalhes dos funcionários →</Link></div>
      </> : null}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, emptyLabel, getLabel = (item) => item.name || "Item" }: { label: string; value: string; onChange: (value: string) => void; options: FilterOption[]; emptyLabel: string; getLabel?: (item: FilterOption) => string }) {
  return <label className="text-xs font-bold text-slate-600">{label}<select className="select mt-1" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{emptyLabel}</option>{options.map((item) => <option key={item.id} value={item.id}>{getLabel(item)}</option>)}</select></label>;
}

function PlainSelect({ value, onChange, options, emptyLabel }: { value: string; onChange: (value: string) => void; options: FilterOption[]; emptyLabel: string }) {
  return <select className="select" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{emptyLabel}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">{text}</div>;
}

function filterLabel(key: string) {
  return ({ companyId: "Empresa", unitId: "Unidade", departmentId: "Setor", positionId: "Cargo", employeeId: "Funcionário", teamId: "Equipe", shiftId: "Turno", epiCategory: "Tipo de EPI", occurrenceType: "Ocorrência", occurrenceStatus: "Status" } as Record<string, string>)[key] ?? key;
}
