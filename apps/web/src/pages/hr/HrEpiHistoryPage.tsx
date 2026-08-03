import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { formatBrazilDateTime } from "../../lib/datetime";
import { EpiSectionTabs, HrSectionTabs, SectionHeading, StatusBadge } from "./HrPrototypeComponents";

type Option = { id: string; name: string; registration?: string; ca?: string };
type Filters = { units: Option[]; departments: Option[]; employees: Option[]; epis: Option[] };
type Movement = {
  id: string;
  movementType: string;
  quantity: number;
  date: string;
  createdAt: string;
  departmentSnapshot?: string | null;
  unitCostSnapshot?: string | null;
  isEstimatedCost?: boolean;
  employee: Option;
  epi: Option & { unit: string };
  unit?: Option | null;
  responsibleUser?: { email?: string; employee?: { name?: string } | null } | null;
};
type MovementPage = { items: Movement[]; total: number; page: number; pageSize: number; canViewCosts: boolean };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function HrEpiHistoryPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", employeeId: "", departmentId: "", unitId: "", epiId: "" });
  const optionsQuery = useQuery({ queryKey: ["hr-epi-movement-filters"], queryFn: () => apiRequest<Filters>("/hr/epi-movement-filters") });
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      params.set(key, key === "endDate" ? `${value}T23:59:59.999-03:00` : value);
    }
    return params.toString();
  }, [filters, page]);
  const movementsQuery = useQuery({ queryKey: ["hr-epi-history", queryString], queryFn: () => apiRequest<MovementPage>(`/hr/epi-movements?${queryString}`) });
  const data = movementsQuery.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const setFilter = (key: keyof typeof filters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <EpiSectionTabs />
      <section className="card p-5">
        <SectionHeading title="Histórico de movimentações de EPI" description="Custos preservados na data do lançamento, com registros mais recentes primeiro." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <input className="input" type="date" aria-label="Data inicial" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} />
          <input className="input" type="date" aria-label="Data final" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} />
          <FilterSelect label="Todos os funcionários" value={filters.employeeId} options={optionsQuery.data?.employees} onChange={(value) => setFilter("employeeId", value)} />
          <FilterSelect label="Todos os setores" value={filters.departmentId} options={optionsQuery.data?.departments} onChange={(value) => setFilter("departmentId", value)} />
          <FilterSelect label="Todas as unidades" value={filters.unitId} options={optionsQuery.data?.units} onChange={(value) => setFilter("unitId", value)} />
          <FilterSelect label="Todos os EPIs" value={filters.epiId} options={optionsQuery.data?.epis} onChange={(value) => setFilter("epiId", value)} />
        </div>

        {movementsQuery.isError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Não foi possível carregar o histórico. Tente novamente.</p> : null}
        {movementsQuery.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Carregando histórico…</p> : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Data</th><th className="px-3 py-3">Funcionário</th><th className="px-3 py-3">EPI</th><th className="px-3 py-3">Movimentação</th><th className="px-3 py-3">Quantidade</th>{data?.canViewCosts ? <><th className="px-3 py-3">Valor unitário</th><th className="px-3 py-3">Valor total</th></> : null}<th className="px-3 py-3">Responsável</th><th className="px-3 py-3">Situação</th></tr></thead>
              <tbody>{data?.items.map((movement) => {
                const unitCost = movement.unitCostSnapshot === null || movement.unitCostSnapshot === undefined ? null : Number(movement.unitCostSnapshot);
                return <tr key={movement.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4 whitespace-nowrap">{formatBrazilDateTime(movement.date)}</td><td className="px-3 py-4"><p className="font-bold">{movement.employee.name}</p><p className="text-xs text-slate-500">{movement.departmentSnapshot || movement.unit?.name || "—"}</p></td><td className="px-3 py-4"><p className="font-bold">{movement.epi.name}</p><p className="text-xs text-slate-500">CA {movement.epi.ca || "—"}</p></td><td className="px-3 py-4">{movement.movementType}</td><td className="px-3 py-4">{movement.quantity} {movement.epi.unit}</td>{data.canViewCosts ? <><td className="px-3 py-4">{unitCost === null ? "—" : currency.format(unitCost)}{movement.isEstimatedCost ? " (estimado)" : ""}</td><td className="px-3 py-4 font-bold">{unitCost === null ? "—" : currency.format(unitCost * movement.quantity)}</td></> : null}<td className="px-3 py-4">{movement.responsibleUser?.employee?.name ?? movement.responsibleUser?.email ?? "—"}</td><td className="px-3 py-4"><StatusBadge tone="success">Registrada</StatusBadge></td></tr>;
              })}</tbody>
            </table>
            {data?.items.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Nenhuma movimentação corresponde aos filtros.</p> : null}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">{data?.total ?? 0} registro(s)</span><div className="flex items-center gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="px-2 font-bold">{page} / {pageCount}</span><button className="btn-secondary" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
      </section>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options?: Option[]; onChange: (value: string) => void }) {
  return <select className="select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options?.map((option) => <option key={option.id} value={option.id}>{option.name}{option.registration ? ` · ${option.registration}` : option.ca ? ` · CA ${option.ca}` : ""}</option>)}</select>;
}
