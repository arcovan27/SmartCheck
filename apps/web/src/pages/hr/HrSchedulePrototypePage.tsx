import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useAuth, userHasPermission } from "../../lib/auth";
import { HrPageHeader, HrSectionTabs, MetricCard, MiniAvatar, StatusBadge } from "./HrPrototypeComponents";
import {
  buildPrototypeCells,
  prototypeEmployees,
  prototypeFrequencies,
  prototypeHolidays,
  prototypePatterns,
  prototypeShifts,
  type PrototypeDayCell,
  type PrototypeEmployee
} from "./hrSchedulePrototypeData";

type PrototypeTab = "monthly" | "shifts" | "patterns" | "import";
type SelectedCell = { employeeId: string; day: number };
type Filters = { search: string; department: string; team: string; shiftId: string; occurrence: string };
type PlannedKind = NonNullable<PrototypeDayCell["planned"]>["kind"];

const dayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const gridTemplate = "220px repeat(31, 84px) 190px";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function dayLabel(day: number) {
  return dayFormatter.format(new Date(2026, 6, day)).replace(".", "");
}

function cellKey(employeeId: string, day: number) {
  return `${employeeId}-${day}`;
}

function countEmployeeSummary(employeeId: string, cells: Record<string, PrototypeDayCell>) {
  let worked = 0;
  let absences = 0;
  let planned = 0;
  let pending = 0;
  for (let day = 1; day <= 31; day += 1) {
    const cell = cells[cellKey(employeeId, day)];
    if (cell?.planned?.kind === "WORK") planned += 1;
    if (cell?.actual?.frequencyId === "freq-worked") worked += 1;
    if (cell?.actual && !["freq-worked", "freq-dsr"].includes(cell.actual.frequencyId)) absences += 1;
    if (cell?.actual?.status === "PENDENTE") pending += 1;
  }
  return { worked, absences, planned, pending };
}

const prototypeTabs: Array<{ id: PrototypeTab; label: string; detail: string }> = [
  { id: "monthly", label: "Grade mensal", detail: "Planejado × realizado" },
  { id: "shifts", label: "Turnos", detail: "Horários e viradas" },
  { id: "patterns", label: "Padrões", detail: "5x2, 6x1 e ciclos" },
  { id: "import", label: "Importar planilha", detail: "Validação assistida" }
];

export function HrSchedulePrototypePage({ forceManage = false }: { forceManage?: boolean }) {
  const { user } = useAuth();
  const canManage = forceManage || userHasPermission(user, "SCHEDULE_MANAGE");
  const [activeTab, setActiveTab] = useState<PrototypeTab>("monthly");
  const [cells, setCells] = useState<Record<string, PrototypeDayCell>>(() => buildPrototypeCells());
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState<Filters>({ search: "", department: "", team: "", shiftId: "", occurrence: "" });

  const visibleEmployees = useMemo(() => prototypeEmployees.filter((employee) => {
    const text = `${employee.name} ${employee.registration}`.toLowerCase();
    if (filters.search && !text.includes(filters.search.toLowerCase())) return false;
    if (filters.department && employee.department !== filters.department) return false;
    if (filters.team && employee.team !== filters.team) return false;
    if (filters.shiftId && employee.shiftId !== filters.shiftId) return false;
    if (filters.occurrence) {
      return Array.from({ length: 31 }, (_, index) => cells[cellKey(employee.id, index + 1)]?.actual?.frequencyId).includes(filters.occurrence);
    }
    return true;
  }), [cells, filters]);

  const metrics = useMemo(() => ({
    today: prototypeEmployees.filter((employee) => cells[cellKey(employee.id, 29)]?.planned?.kind === "WORK").length,
    pending: Object.values(cells).filter((cell) => cell.actual?.status === "PENDENTE").length,
    conflicts: Object.values(cells).filter((cell) => cell.conflict).length,
    withoutSchedule: prototypeEmployees.filter((employee) => !Array.from({ length: 31 }, (_, index) => cells[cellKey(employee.id, index + 1)]?.planned).some(Boolean)).length
  }), [cells]);

  function saveCell(next: PrototypeDayCell) {
    if (!selectedCell) return;
    setCells((current) => ({ ...current, [cellKey(selectedCell.employeeId, selectedCell.day)]: next }));
    setSelectedCell(null);
    setNotice("Alteração simulada somente neste protótipo. Nenhum dado foi enviado ao servidor.");
  }

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <HrPageHeader
        eyebrow="Recursos Humanos · Escala de trabalho"
        title="Planejamento e frequência no mesmo lugar"
        description="Protótipo navegável da competência julho/2026. Todos os nomes, turnos e lançamentos abaixo são fictícios e nenhuma ação é persistida."
        action={canManage ? <button className="rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-brand-300" onClick={() => setBulkOpen(true)}>Aplicar padrão</button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-700 font-extrabold text-white">P</span>
        <strong>Protótipo seguro:</strong> dados fictícios, sem conexão de escrita com a API ou o banco de produção.
      </div>

      <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Áreas do protótipo de escala">
        {prototypeTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-2xl border p-4 text-left transition ${activeTab === tab.id ? "border-brand-700 bg-brand-700 text-white shadow-lg" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300"}`}>
            <span className="block text-sm font-extrabold">{tab.label}</span>
            <span className={`mt-1 block text-xs ${activeTab === tab.id ? "text-brand-100" : "text-slate-500"}`}>{tab.detail}</span>
          </button>
        ))}
      </nav>

      {notice ? <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button></div> : null}

      {activeTab === "monthly" ? (
        <MonthlyGrid
          cells={cells}
          employees={visibleEmployees}
          filters={filters}
          metrics={metrics}
          onFiltersChange={setFilters}
          onCellClick={(employeeId, day) => setSelectedCell({ employeeId, day })}
          onBulk={() => setBulkOpen(true)}
          canManage={canManage}
        />
      ) : null}
      {activeTab === "shifts" ? <ShiftsPrototype canManage={canManage} onNotice={setNotice} /> : null}
      {activeTab === "patterns" ? <PatternsPrototype canManage={canManage} onApply={() => setBulkOpen(true)} onNotice={setNotice} /> : null}
      {activeTab === "import" ? <ImportPrototype canManage={canManage} onNotice={setNotice} /> : null}

      {selectedCell ? (
        <CellEditor
          key={`${selectedCell.employeeId}-${selectedCell.day}`}
          selected={selectedCell}
          current={cells[cellKey(selectedCell.employeeId, selectedCell.day)] ?? {}}
          canManage={canManage}
          onClose={() => setSelectedCell(null)}
          onSave={saveCell}
        />
      ) : null}
      {bulkOpen ? <BulkPreview canManage={canManage} onClose={() => setBulkOpen(false)} onConfirm={() => { setBulkOpen(false); setNotice("Aplicação em massa simulada: 72 registros seriam atualizados após a confirmação real."); }} /> : null}
    </div>
  );
}

function MonthlyGrid({ cells, employees, filters, metrics, onFiltersChange, onCellClick, onBulk, canManage }: {
  cells: Record<string, PrototypeDayCell>;
  employees: PrototypeEmployee[];
  filters: Filters;
  metrics: { today: number; pending: number; conflicts: number; withoutSchedule: number };
  onFiltersChange: (filters: Filters) => void;
  onCellClick: (employeeId: string, day: number) => void;
  onBulk: () => void;
  canManage: boolean;
}) {
  const departments = [...new Set(prototypeEmployees.map((item) => item.department))];
  const teams = [...new Set(prototypeEmployees.map((item) => item.team))];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const style = { gridTemplateColumns: gridTemplate } as CSSProperties;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Escalados hoje" value={String(metrics.today)} detail="Quarta-feira, 29 de julho" tone="success" />
        <MetricCard label="Pendências" value={String(metrics.pending)} detail="Frequências aguardando análise" tone="warning" />
        <MetricCard label="Conflitos" value={String(metrics.conflicts)} detail="Sobreposições que exigem ação" tone="danger" />
        <MetricCard label="Sem escala" value={String(metrics.withoutSchedule)} detail="Funcionários sem planejamento" tone="info" />
      </div>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Competência</p>
            <h3 className="mt-1 text-xl font-extrabold capitalize">{monthFormatter.format(new Date(2026, 6, 1))}</h3>
            <p className="mt-1 text-sm text-slate-500">Matriz · competência aberta · 8 funcionários fictícios</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary">←</button>
            <button className="btn-secondary">Hoje</button>
            <button className="btn-secondary">→</button>
            {canManage ? <button className="btn-primary" onClick={onBulk}>Edição em massa</button> : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-bold text-slate-600">Funcionário ou matrícula<input className="input mt-1" placeholder="Buscar..." value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} /></label>
          <label className="text-xs font-bold text-slate-600">Setor<select className="select mt-1" value={filters.department} onChange={(event) => onFiltersChange({ ...filters, department: event.target.value })}><option value="">Todos</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Equipe<select className="select mt-1" value={filters.team} onChange={(event) => onFiltersChange({ ...filters, team: event.target.value })}><option value="">Todas</option>{teams.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Turno<select className="select mt-1" value={filters.shiftId} onChange={(event) => onFiltersChange({ ...filters, shiftId: event.target.value })}><option value="">Todos</option>{prototypeShifts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Frequência<select className="select mt-1" value={filters.occurrence} onChange={(event) => onFiltersChange({ ...filters, occurrence: event.target.value })}><option value="">Todas</option>{prototypeFrequencies.map((item) => <option key={item.id} value={item.id}>{item.shortCode} · {item.name}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-slate-500">{employees.length} funcionário(s) exibido(s) · {activeFilterCount} filtro(s) ativo(s)</span>
          {activeFilterCount ? <button className="font-bold text-brand-700" onClick={() => onFiltersChange({ search: "", department: "", team: "", shiftId: "", occurrence: "" })}>Limpar filtros</button> : null}
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="font-extrabold">Grade mensal</h3>
            <p className="text-sm text-slate-500">A faixa superior da célula é o planejado; a inferior é o realizado.</p>
          </div>
          <div className="flex flex-wrap gap-2"><StatusBadge tone="info">Hoje</StatusBadge><StatusBadge tone="warning">Pendente</StatusBadge><StatusBadge tone="danger">Conflito</StatusBadge></div>
        </div>
        <div className="max-h-[650px] overflow-auto bg-slate-100" data-testid="monthly-grid">
          <div className="grid min-w-max sticky top-0 z-30 border-b bg-white shadow-sm" style={style}>
            <div className="sticky left-0 z-40 border-r bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white">Funcionário</div>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const weekday = new Date(2026, 6, day).getDay();
              const weekend = weekday === 0 || weekday === 6;
              const holiday = prototypeHolidays.has(day);
              return <div key={day} className={`border-r px-1 py-2 text-center ${day === 29 ? "bg-cyan-100 text-cyan-900" : weekend || holiday ? "bg-slate-100 text-slate-600" : "bg-white"}`}><p className="text-[10px] font-bold uppercase">{dayLabel(day)}</p><p className="text-base font-extrabold">{String(day).padStart(2, "0")}</p>{holiday ? <span className="text-[9px] font-bold text-violet-700">FERIADO</span> : null}</div>;
            })}
            <div className="border-l bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white">Resumo mensal</div>
          </div>

          {employees.map((employee) => {
            const summary = countEmployeeSummary(employee.id, cells);
            return (
              <div key={employee.id} className="grid min-w-max border-b border-slate-200 bg-white" style={style}>
                <div className="sticky left-0 z-20 flex items-center gap-3 border-r bg-white px-3 py-2 shadow-[5px_0_10px_rgba(15,23,42,0.07)]">
                  <MiniAvatar initials={initials(employee.name)} />
                  <div className="min-w-0"><p className="truncate text-sm font-extrabold">{employee.name}</p><p className="truncate text-[11px] text-slate-500">{employee.registration} · {employee.department}</p><p className="truncate text-[10px] font-semibold text-brand-700">{employee.team}</p></div>
                </div>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <DayCell key={day} day={day} cell={cells[cellKey(employee.id, day)]} onClick={() => onCellClick(employee.id, day)} />
                ))}
                <button className="border-l bg-slate-50 p-2 text-left text-[11px] hover:bg-brand-50" onClick={() => onCellClick(employee.id, 1)}>
                  <span className="grid grid-cols-2 gap-x-2"><b>Prev.</b><span>{summary.planned}</span><b>Trab.</b><span>{summary.worked}</span><b>Ausên.</b><span className={summary.absences ? "font-bold text-red-700" : ""}>{summary.absences}</span><b>Pend.</b><span className={summary.pending ? "font-bold text-amber-700" : ""}>{summary.pending}</span></span>
                </button>
              </div>
            );
          })}
          {!employees.length ? <div className="bg-white p-12 text-center text-slate-500">Nenhum funcionário encontrado para os filtros selecionados.</div> : null}
        </div>
      </section>
    </div>
  );
}

function DayCell({ day, cell, onClick }: { day: number; cell?: PrototypeDayCell; onClick: () => void }) {
  const frequency = prototypeFrequencies.find((item) => item.id === cell?.actual?.frequencyId);
  const weekday = new Date(2026, 6, day).getDay();
  const weekend = weekday === 0 || weekday === 6;
  const background = day === 29 ? "bg-cyan-50" : weekend ? "bg-slate-50" : "bg-white";
  return (
    <button onClick={onClick} className={`relative min-h-[76px] border-r p-1 text-left transition hover:z-10 hover:bg-brand-50 hover:ring-2 hover:ring-inset hover:ring-brand-400 ${background} ${cell?.conflict ? "ring-2 ring-inset ring-red-500" : ""}`} title={cell?.note}>
      <span className={`block rounded-md px-1.5 py-1 text-[10px] font-extrabold ${cell?.planned?.kind === "WORK" ? "bg-slate-800 text-white" : cell?.planned?.kind === "HOLIDAY" ? "bg-violet-100 text-violet-800" : "bg-slate-200 text-slate-600"}`}>{cell?.planned?.label ?? "—"}</span>
      {frequency ? <span className="mt-1 block rounded-md px-1.5 py-1 text-[10px] font-extrabold text-white" style={{ backgroundColor: frequency.color }}>{frequency.shortCode}{cell?.actual?.status === "PENDENTE" ? " · !" : ""}</span> : <span className="mt-1 block px-1 text-[10px] text-slate-400">Sem apont.</span>}
      {cell?.conflict ? <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">!</span> : null}
    </button>
  );
}

function CellEditor({ selected, current, canManage, onClose, onSave }: { selected: SelectedCell; current: PrototypeDayCell; canManage: boolean; onClose: () => void; onSave: (cell: PrototypeDayCell) => void }) {
  const employee = prototypeEmployees.find((item) => item.id === selected.employeeId)!;
  const [plannedKind, setPlannedKind] = useState(current.planned?.kind ?? "WORK");
  const [shiftId, setShiftId] = useState(current.planned?.shiftId ?? employee.shiftId ?? "shift-adm");
  const [frequencyId, setFrequencyId] = useState(current.actual?.frequencyId ?? "");
  const [note, setNote] = useState(current.note ?? "");
  const selectedFrequency = prototypeFrequencies.find((item) => item.id === frequencyId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const shift = prototypeShifts.find((item) => item.id === shiftId);
    onSave({
      planned: plannedKind === "WORK" ? { kind: "WORK", label: shift?.code ?? "AV", shiftId } : plannedKind === "DSR" ? { kind: "DSR", label: "DSR" } : plannedKind === "HOLIDAY" ? { kind: "HOLIDAY", label: "FD" } : { kind: "DAY_OFF", label: "F" },
      actual: frequencyId ? { frequencyId, status: selectedFrequency?.requiresApproval ? "PENDENTE" : "APROVADO" } : undefined,
      note: note || undefined,
      conflict: current.conflict
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60" role="dialog" aria-modal="true" aria-label="Editar escala diária">
      <form className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3 border-b pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Lançamento diário</p><h3 className="mt-1 text-2xl font-extrabold">{employee.name}</h3><p className="mt-1 text-sm text-slate-500">{employee.registration} · {String(selected.day).padStart(2, "0")}/07/2026 · {dayLabel(selected.day)}</p></div><button type="button" className="text-2xl text-slate-500" onClick={onClose} aria-label="Fechar">×</button></div>

        <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-4"><p className="font-extrabold text-brand-900">Planejamento previsto</p><p className="mt-1 text-sm text-brand-800">A ocorrência realizada não apaga nem substitui esta camada.</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Tipo do dia<select className="select mt-1" value={plannedKind} onChange={(event) => setPlannedKind(event.target.value as PlannedKind)}><option value="WORK">Dia de trabalho</option><option value="DSR">DSR</option><option value="DAY_OFF">Folga</option><option value="HOLIDAY">Feriado</option></select></label>
          <label className="text-xs font-bold text-slate-600">Turno<select className="select mt-1" value={shiftId} disabled={plannedKind !== "WORK"} onChange={(event) => setShiftId(event.target.value)}>{prototypeShifts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.start}–{item.end}</option>)}</select></label>
        </div>

        <div className="my-6 border-t" />
        <div><p className="font-extrabold">Apontamento realizado</p><p className="mt-1 text-sm text-slate-500">Registre apenas o que realmente aconteceu neste dia.</p></div>
        <label className="mt-4 block text-xs font-bold text-slate-600">Frequência<select className="select mt-1" value={frequencyId} onChange={(event) => setFrequencyId(event.target.value)}><option value="">Sem informação</option>{prototypeFrequencies.map((item) => <option key={item.id} value={item.id}>{item.shortCode} · {item.name}</option>)}</select></label>
        {selectedFrequency?.requiresDocument ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Documento obrigatório.</strong> No produto final, PDF, JPG ou PNG será enviado ao armazenamento privado antes da aprovação.</div> : null}
        <label className="mt-4 block text-xs font-bold text-slate-600">Observação<textarea className="textarea mt-1 min-h-24" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contexto operacional sem dados médicos sensíveis" /></label>
        {current.conflict ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Conflito detectado:</strong> existe uma cobertura temporária sobreposta neste dia.</div> : null}

        <div className="mt-8 flex flex-wrap justify-end gap-2 border-t pt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!canManage}>{canManage ? "Salvar no protótipo" : "Somente leitura"}</button></div>
      </form>
    </div>
  );
}

function BulkPreview({ canManage, onClose, onConfirm }: { canManage: boolean; onClose: () => void; onConfirm: () => void }) {
  const [preview, setPreview] = useState(false);
  const [patternId, setPatternId] = useState("pattern-5x2");
  const [from, setFrom] = useState("2026-07-20");
  const [to, setTo] = useState("2026-07-31");
  const pattern = prototypePatterns.find((item) => item.id === patternId)!;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-label="Prévia de aplicação em massa">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Alteração em massa</p><h3 className="mt-1 text-2xl font-extrabold">{preview ? "Prévia antes da confirmação" : "Aplicar padrão de escala"}</h3></div><button className="text-2xl text-slate-500" onClick={onClose} aria-label="Fechar">×</button></div>
        {!preview ? <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold">Padrão<select className="select mt-1" value={patternId} onChange={(event) => setPatternId(event.target.value)}>{prototypePatterns.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label className="text-xs font-bold">Aplicar para<select className="select mt-1"><option>Equipe Alfa · 6 funcionários</option><option>Equipe Beta · 4 funcionários</option><option>Selecionar individualmente</option></select></label><label className="text-xs font-bold">Data inicial<input type="date" className="input mt-1" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-bold">Data final<input type="date" className="input mt-1" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="sm:col-span-2 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-semibold"><input type="checkbox" defaultChecked /> Alterar somente dias futuros sem frequência realizada</label></div> : (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Registros afetados" value="72" detail="6 funcionários · 12 dias" tone="info" /><MetricCard label="Mantidos" value="9" detail="Realizados ou já aprovados" tone="success" /><MetricCard label="Alterados" value="61" detail={`${pattern.code} · ${from.slice(8)} a ${to.slice(8)}`} tone="warning" /><MetricCard label="Conflitos" value="2" detail="Não serão gravados" tone="danger" /></div>
            <div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Funcionário</th><th className="p-3">Período</th><th className="p-3">Situação atual</th><th className="p-3">Resultado</th></tr></thead><tbody><tr className="border-t"><td className="p-3 font-bold">Bruno Almeida</td><td className="p-3">20–31/07</td><td className="p-3">Turno A</td><td className="p-3"><StatusBadge tone="success">12 dias validados</StatusBadge></td></tr><tr className="border-t"><td className="p-3 font-bold">Carla Nogueira</td><td className="p-3">20–31/07</td><td className="p-3">Férias em 20/07</td><td className="p-3"><StatusBadge tone="warning">1 mantido</StatusBadge></td></tr><tr className="border-t"><td className="p-3 font-bold">Diego Santos</td><td className="p-3">20–31/07</td><td className="p-3">Cobertura temporária</td><td className="p-3"><StatusBadge tone="danger">2 conflitos</StatusBadge></td></tr></tbody></table></div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Confirmação protegida:</strong> os dois conflitos permanecerão fora do lote. Registros realizados e aprovados serão preservados.</div>
          </div>
        )}
        <div className="mt-7 flex justify-end gap-2 border-t pt-5"><button className="btn-secondary" onClick={preview ? () => setPreview(false) : onClose}>{preview ? "Voltar" : "Cancelar"}</button><button className="btn-primary" disabled={!canManage} onClick={preview ? onConfirm : () => setPreview(true)}>{preview ? "Confirmar simulação" : "Gerar prévia"}</button></div>
      </div>
    </div>
  );
}

function ShiftsPrototype({ canManage, onNotice }: { canManage: boolean; onNotice: (message: string) => void }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Cadastro auxiliar</p><h3 className="mt-1 text-2xl font-extrabold">Turnos de trabalho</h3><p className="mt-1 text-sm text-slate-500">Horários configuráveis, intervalo e virada de dia explícita.</p></div>{canManage ? <button className="btn-primary" onClick={() => onNotice("Formulário de novo turno simulado; persistência será implementada na Etapa 3.")}>Novo turno</button> : null}</div>
      <div className="mt-6 overflow-x-auto rounded-2xl border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-4">Turno</th><th className="p-4">Horário</th><th className="p-4">Intervalo</th><th className="p-4">Duração prevista</th><th className="p-4">Status</th><th className="p-4 text-right">Ação</th></tr></thead><tbody>{prototypeShifts.map((shift) => { const duration = ((Number(shift.end.slice(0, 2)) * 60 + Number(shift.end.slice(3))) - (Number(shift.start.slice(0, 2)) * 60 + Number(shift.start.slice(3))) + (shift.crossesMidnight ? 1440 : 0) - shift.breakMinutes) / 60; return <tr key={shift.id} className="border-t"><td className="p-4"><span className="mr-3 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: shift.color }} /><strong>{shift.code}</strong><span className="ml-2 text-slate-500">{shift.name}</span></td><td className="p-4 font-semibold">{shift.start}–{shift.end}{shift.crossesMidnight ? <span className="ml-2 text-xs text-violet-700">dia seguinte</span> : null}</td><td className="p-4">{shift.breakMinutes} min</td><td className="p-4">{duration.toLocaleString("pt-BR")}h</td><td className="p-4"><StatusBadge tone={shift.active ? "success" : "neutral"}>{shift.active ? "Ativo" : "Inativo"}</StatusBadge></td><td className="p-4 text-right"><button className="font-bold text-brand-700" onClick={() => onNotice(`Edição do turno ${shift.code} aberta apenas em modo de demonstração.`)}>Editar</button></td></tr>; })}</tbody></table></div>
    </section>
  );
}

function PatternsPrototype({ canManage, onApply, onNotice }: { canManage: boolean; onApply: () => void; onNotice: (message: string) => void }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Ciclos configuráveis</p><h3 className="mt-1 text-2xl font-extrabold">Padrões de escala</h3><p className="mt-1 text-sm text-slate-500">Os nomes são rótulos; o comportamento é definido pelos dias do ciclo.</p></div>{canManage ? <button className="btn-primary" onClick={() => onNotice("Editor de ciclo personalizado simulado com dados fictícios.")}>Novo padrão</button> : null}</div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{prototypePatterns.map((pattern) => { const shift = prototypeShifts.find((item) => item.id === pattern.shiftId); return <article key={pattern.id} className={`rounded-2xl border p-5 ${pattern.active ? "border-slate-200 bg-white" : "border-dashed bg-slate-50 opacity-75"}`}><div className="flex items-start justify-between gap-3"><div><span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-extrabold text-white">{pattern.code}</span><h4 className="mt-3 text-lg font-extrabold">{pattern.name}</h4></div><StatusBadge tone={pattern.active ? "success" : "neutral"}>{pattern.active ? "Ativo" : "Rascunho"}</StatusBadge></div><p className="mt-2 text-sm text-slate-500">{pattern.description}</p><div className="mt-4 flex gap-1">{pattern.cycle.map((day, index) => <span key={`${day}-${index}`} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-extrabold ${day === "T" ? "bg-brand-100 text-brand-800" : day === "DSR" ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600"}`}>{day}</span>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-slate-500">{shift ? `${shift.code} · ${shift.start}–${shift.end}` : "Turno definido na aplicação"} · {pattern.people} pessoa(s)</span>{pattern.active && canManage ? <button className="font-extrabold text-brand-700" onClick={onApply}>Aplicar padrão →</button> : null}</div></article>; })}</div>
    </section>
  );
}

function ImportPrototype({ canManage, onNotice }: { canManage: boolean; onNotice: (message: string) => void }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [adResolution, setAdResolution] = useState("");
  const [finished, setFinished] = useState(false);
  const steps = ["Arquivo", "Funcionários", "Códigos", "Prévia"];
  if (finished) return <section className="card p-8 text-center"><span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">✓</span><h3 className="mt-4 text-2xl font-extrabold">Simulação concluída</h3><p className="mx-auto mt-2 max-w-xl text-slate-500">Nenhum registro foi importado. O relatório fictício identificou 1.938 células, 64 funcionários, 3 associações que exigem revisão e 93 códigos AD tratados pela regra escolhida.</p><button className="btn-secondary mt-6" onClick={() => { setFinished(false); setStep(1); setFileName(""); setAdResolution(""); }}>Reiniciar demonstração</button></section>;
  return (
    <section className="card p-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Importação assistida</p><h3 className="mt-1 text-2xl font-extrabold">Trazer uma escala da planilha</h3><p className="mt-1 text-sm text-slate-500">Fluxo demonstrativo. A confirmação real continuará desabilitada até a implementação do backend.</p></div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-4">{steps.map((label, index) => <li key={label} className={`rounded-xl border px-3 py-3 text-sm font-bold ${step === index + 1 ? "border-brand-700 bg-brand-700 text-white" : step > index + 1 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}><span className="mr-2">{index + 1}</span>{label}</li>)}</ol>

      {step === 1 ? <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr,0.7fr]"><label className="grid min-h-56 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-brand-400"><input className="sr-only" type="file" accept=".xlsx" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /><span><span className="text-4xl">⇧</span><strong className="mt-3 block">Selecione um arquivo .xlsx</strong><span className="mt-1 block text-sm text-slate-500">O arquivo será validado antes de qualquer associação.</span>{fileName ? <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{fileName}</span> : null}</span></label><div className="rounded-2xl border p-5"><h4 className="font-extrabold">Arquivo de demonstração</h4><p className="mt-2 text-sm text-slate-500">Use a estrutura auditada sem enviar um arquivo real.</p><button className="btn-secondary mt-4 w-full" onClick={() => setFileName("ESCALA-2026-DEMO.xlsx")}>Carregar exemplo fictício</button>{fileName ? <label className="mt-5 block text-xs font-bold">Aba<select className="select mt-1"><option>MAIO</option><option>ABRIL</option><option>JUNHO</option></select></label> : null}</div></div> : null}

      {step === 2 ? <div className="mt-6 space-y-4"><div className="grid gap-3 sm:grid-cols-4"><MetricCard label="Seguro" value="61" detail="Matrícula validada" tone="success" /><MetricCard label="Sugerido" value="1" detail="Exige confirmação" tone="warning" /><MetricCard label="Duplicado" value="1" detail="Dois cadastros possíveis" tone="danger" /><MetricCard label="Não encontrado" value="1" detail="Sem vínculo automático" tone="info" /></div><div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Planilha</th><th className="p-3">Identificador</th><th className="p-3">Cadastro sugerido</th><th className="p-3">Situação</th></tr></thead><tbody><tr className="border-t"><td className="p-3 font-bold">Funcionário Exemplo 01</td><td className="p-3">F-0108</td><td className="p-3">Correspondência por matrícula</td><td className="p-3"><StatusBadge tone="success">Seguro</StatusBadge></td></tr><tr className="border-t"><td className="p-3 font-bold">Funcionário Exemplo 02</td><td className="p-3">Sem matrícula</td><td className="p-3"><select className="select"><option>Selecionar manualmente</option><option>Cadastro fictício A</option></select></td><td className="p-3"><StatusBadge tone="warning">Revisar</StatusBadge></td></tr><tr className="border-t"><td className="p-3 font-bold">Funcionário Exemplo 03</td><td className="p-3">Duplicado</td><td className="p-3">Nenhuma ação automática</td><td className="p-3"><StatusBadge tone="danger">Bloqueado</StatusBadge></td></tr></tbody></table></div></div> : null}

      {step === 3 ? <div className="mt-6 space-y-5"><div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900"><div className="flex items-start gap-3"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-700 font-black text-white">!</span><div><h4 className="font-extrabold">O código AD é ambíguo e está bloqueado</h4><p className="mt-1 text-sm">Foram encontradas 93 células AD na aba MAIO. Nenhum significado será deduzido automaticamente.</p></div></div><div className="mt-4 grid gap-2">{[["AUX_DOENCA", "Todos representam auxílio-doença"], ["ADVERT", "Todos representam advertência"], ["FALTA_JUST", "Todos representam falta"], ["INDIVIDUAL", "Resolver individualmente"], ["IGNORE", "Ignorar esses registros"]].map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold ${adResolution === value ? "border-red-700 bg-white" : "border-red-200 bg-red-50"}`}><input type="radio" name="ad-resolution" value={value} checked={adResolution === value} onChange={(event) => setAdResolution(event.target.value)} />{label}</label>)}</div></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["T", "TRAB", "Trabalhou"], ["DSR", "DSR", "Descanso remunerado"], ["AT", "ATEST", "Atestado"], ["IN", "FALTA_INJ", "Falta injustificada"]].map(([source, target, name]) => <div key={source} className="rounded-xl border p-3 text-sm"><span className="font-extrabold">{source}</span><span className="mx-2 text-slate-400">→</span><span className="font-bold text-brand-700">{target}</span><p className="mt-1 text-xs text-slate-500">{name}</p></div>)}</div></div> : null}

      {step === 4 ? <div className="mt-6 space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Células lidas" value="1.938" detail="Valores diários brutos" tone="info" /><MetricCard label="Novos registros" value="1.842" detail="Sem duplicidade" tone="success" /><MetricCard label="Divergências" value="24" detail="Exigem decisão" tone="warning" /><MetricCard label="Bloqueados" value="72" detail="Associação pendente" tone="danger" /></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Regra AD registrada:</strong> {adResolution === "INDIVIDUAL" ? "resolver cada célula individualmente" : adResolution === "IGNORE" ? "ignorar as 93 células" : `mapear para ${adResolution}`}. O relatório final conservará esta decisão.</div><div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Funcionário</th><th className="p-3">Data</th><th className="p-3">Planilha</th><th className="p-3">Sistema</th><th className="p-3">Ação proposta</th></tr></thead><tbody><tr className="border-t"><td className="p-3 font-bold">Funcionário Exemplo 01</td><td className="p-3">05/05/2026</td><td className="p-3">T</td><td className="p-3">Sem informação</td><td className="p-3"><StatusBadge tone="success">Criar apontamento</StatusBadge></td></tr><tr className="border-t"><td className="p-3 font-bold">Funcionário Exemplo 02</td><td className="p-3">12/05/2026</td><td className="p-3">AT</td><td className="p-3">Falta aprovada</td><td className="p-3"><StatusBadge tone="warning">Resolver divergência</StatusBadge></td></tr></tbody></table></div></div> : null}

      <div className="mt-7 flex flex-wrap justify-between gap-3 border-t pt-5"><button className="btn-secondary" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>Voltar</button><button className="btn-primary" disabled={!canManage || (step === 1 && !fileName) || (step === 3 && !adResolution)} onClick={() => { if (step < 4) setStep((current) => current + 1); else { setFinished(true); onNotice("Fluxo de importação concluído apenas em modo de demonstração."); } }}>{step === 4 ? "Finalizar simulação" : "Continuar"}</button></div>
    </section>
  );
}
