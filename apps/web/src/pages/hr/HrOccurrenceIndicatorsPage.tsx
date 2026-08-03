import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { useAuth, userHasPermission } from "../../lib/auth";
import { formatBrazilDate, toBrazilDateInputValue } from "../../lib/datetime";
import { HrPageHeader, HrSectionTabs, SectionHeading, StatusBadge } from "./HrPrototypeComponents";
import { OccurrenceEditor, emptyOccurrenceForm, type OccurrenceReason } from "./HrEmployeesPrototypePage";

type AggregateItem = { key: string; value: number };
type ChartItem = { name?: string; date?: string; value: number };
type FilterOption = { id: string; name?: string; legalName?: string; tradeName?: string; registration?: string; companyId?: string };
type FilterData = { companies: FilterOption[]; units: FilterOption[]; departments: FilterOption[]; employees: FilterOption[]; teams: FilterOption[]; shifts: FilterOption[] };

type OccurrenceItem = {
  id: string;
  type: string;
  startDate?: string | null;
  endDate?: string | null;
  date: string;
  daysAway?: number | null;
  hoursAway?: string | number | null;
  status: string;
  description: string;
  notes?: string | null;
  reasonId?: string | null;
  accidentOccurredAt?: string | null;
  accidentLocation?: string | null;
  hasAccidentLeave?: boolean | null;
  accidentLeaveStartDate?: string | null;
  accidentLeaveEndDate?: string | null;
  catNumber?: string | null;
  departmentNameSnapshot?: string | null;
  employee: {
    id: string;
    name: string;
    registration: string;
    department?: string | null;
    company?: { legalName: string; tradeName?: string | null } | null;
    unitRef?: { name: string } | null;
    departmentRef?: { name: string; deletedAt?: string | null } | null;
  };
  registeredBy?: { email: string } | null;
  frequencyType?: { code: string; name: string; category: string; color: string } | null;
  dailyAttendances: Array<{ frequencyType: { code: string; name: string; category: string; color: string } }>;
};

type IndicatorData = {
  aggregate: {
    total: number;
    affectedEmployees: number;
    totalDays: number;
    warnings: number;
    suspensions: number;
    suspensionDays: number;
    workAccidents: number;
    workAccidentsWithLeave: number;
    workAccidentsWithoutLeave: number;
    workAccidentLeaveDays: number;
    byType: AggregateItem[];
    evolution: Array<{ date: string; value: number }>;
    byDepartment: Array<{ name: string; value: number }>;
    byUnit: Array<{ name: string; value: number }>;
  };
  items: OccurrenceItem[];
  total: number;
  page: number;
  pageSize: number;
};

const bucketLabels: Record<string, string> = {
  JUSTIFIED_ABSENCE: "Faltas justificadas",
  UNJUSTIFIED_ABSENCE: "Faltas injustificadas",
  MEDICAL_CERTIFICATE: "Atestados",
  LEAVE: "Afastamentos",
  VACATION: "Férias",
  WARNING: "Advertências",
  SUSPENSION: "Suspensões",
  WORK_ACCIDENT: "Acidentes de trabalho",
  LICENSE: "Licenças",
  OTHER: "Outros"
};

function currentMonthStart() {
  const value = toBrazilDateInputValue();
  return `${value.slice(0, 7)}-01`;
}

function dateInput(value?: string | null) {
  return value?.slice(0, 10) ?? "";
}

function apiCivilDate(value: string) {
  return `${value}T12:00:00-03:00`;
}

function frequencyCode(item: OccurrenceItem) {
  if (item.frequencyType?.code) return item.frequencyType.code;
  if (item.dailyAttendances[0]?.frequencyType.code) return item.dailyAttendances[0].frequencyType.code;
  return ({ FALTA: "FALTA_INJ", ATESTADO_MEDICO: "ATEST", AFASTAMENTO: "AUX_DOENCA", FERIAS: "FERIAS", ADVERTENCIA: "ADVERT", SUSPENSAO: "SUSP", ACIDENTE_TRABALHO: "ACID_TRAB" } as Record<string, string>)[item.type] ?? "OUTRO";
}

export function HrOccurrenceIndicatorsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(emptyOccurrenceForm);
  const [editor, setEditor] = useState<{ employeeId: string; item?: OccurrenceItem } | null>(null);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [pickedEmployeeId, setPickedEmployeeId] = useState("");
  const [viewItem, setViewItem] = useState<OccurrenceItem | null>(null);
  const startDate = searchParams.get("startDate") ?? currentMonthStart();
  const endDate = searchParams.get("endDate") ?? toBrazilDateInputValue();
  const page = Number(searchParams.get("page") ?? "1");
  const requestParams = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.delete("epiCategory");
    if (params.get("occurrenceStatus") && !params.get("status")) params.set("status", params.get("occurrenceStatus")!);
    params.delete("occurrenceStatus");
    return params;
  }, [searchParams, startDate, endDate, page]);
  const query = useQuery({ queryKey: ["hr-occurrence-indicators", requestParams.toString()], queryFn: () => apiRequest<IndicatorData>(`/hr/occurrences/indicators?${requestParams.toString()}`) });
  const filtersQuery = useQuery({ queryKey: ["hr-dashboard-filters"], queryFn: () => apiRequest<FilterData>("/hr/dashboard/filters") });
  const reasonsQuery = useQuery({
    queryKey: ["hr-occurrence-reasons", editor?.employeeId, form.frequencyCode],
    queryFn: () => apiRequest<OccurrenceReason[]>(`/hr/occurrences/reasons?employeeId=${editor?.employeeId}&frequencyCode=${form.frequencyCode}`),
    enabled: Boolean(editor?.employeeId)
  });
  const selectedEmployee = filtersQuery.data?.employees.find((item) => item.id === editor?.employeeId);
  const counts = new Map(query.data?.aggregate.byType.map((item) => [item.key, item.value]) ?? []);
  const occurrenceTypes = [
    { code: "FALTA_INJ", label: "Falta" },
    { code: "ATEST", label: "Atestado" },
    { code: "AUX_DOENCA", label: "Afastamento" },
    { code: "FERIAS", label: "Férias" },
    ...(userHasPermission(user, "WARNING_REGISTER") ? [{ code: "ADVERT", label: "Advertência" }] : []),
    ...(userHasPermission(user, "SUSPENSION_REGISTER") ? [{ code: "SUSP", label: "Suspensão" }] : []),
    ...(userHasPermission(user, "WORK_ACCIDENT_REGISTER") ? [{ code: "ACID_TRAB", label: "Acidente de trabalho" }] : []),
    { code: "OUTRO", label: "Outros" }
  ];
  const canCreate = userHasPermission(user, "OCCURRENCE_REGISTER") || userHasPermission(user, "OCCURRENCE_EDIT");
  const canEdit = userHasPermission(user, "OCCURRENCE_EDIT") || userHasPermission(user, "OCCURRENCE_REGISTER");
  const canCancel = userHasPermission(user, "OCCURRENCE_CANCEL") || userHasPermission(user, "OCCURRENCE_REVIEW");

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    if (key !== "page") params.set("page", "1");
    setSearchParams(params);
  }

  function openCreate(employeeId: string) {
    setForm(emptyOccurrenceForm());
    setEditor({ employeeId });
    setEmployeePickerOpen(false);
  }

  function openEdit(item: OccurrenceItem) {
    const code = frequencyCode(item);
    setForm({
      ...emptyOccurrenceForm(),
      frequencyCode: code,
      startDate: dateInput(item.startDate ?? item.date),
      endDate: dateInput(item.endDate),
      description: item.description,
      notes: item.notes ?? "",
      reasonId: item.reasonId ?? "",
      accidentOccurredAt: item.accidentOccurredAt?.slice(0, 16) ?? "",
      accidentLocation: item.accidentLocation ?? "",
      hasAccidentLeave: Boolean(item.hasAccidentLeave),
      accidentLeaveStartDate: dateInput(item.accidentLeaveStartDate),
      accidentLeaveEndDate: dateInput(item.accidentLeaveEndDate),
      catNumber: item.catNumber ?? ""
    });
    setEditor({ employeeId: item.employee.id, item });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Selecione um funcionário");
      const payload = {
        ...(editor.item ? {} : { employeeId: editor.employeeId, idempotencyKey: form.idempotencyKey }),
        ...(form.frequencyCode === "OUTRO" ? { type: "OUTRO" } : { frequencyCode: form.frequencyCode }),
        startDate: apiCivilDate(form.startDate),
        endDate: form.endDate ? apiCivilDate(form.endDate) : null,
        description: form.description,
        notes: form.notes || null,
        reasonId: form.reasonId || null,
        isJustified: form.frequencyCode !== "FALTA_INJ",
        accidentOccurredAt: form.accidentOccurredAt ? new Date(form.accidentOccurredAt).toISOString() : null,
        accidentLocation: form.accidentLocation || null,
        hasAccidentLeave: form.frequencyCode === "ACID_TRAB" ? form.hasAccidentLeave : null,
        accidentLeaveStartDate: form.accidentLeaveStartDate ? apiCivilDate(form.accidentLeaveStartDate) : null,
        accidentLeaveEndDate: form.accidentLeaveEndDate ? apiCivilDate(form.accidentLeaveEndDate) : null,
        catNumber: form.catNumber || null
      };
      const occurrence = await apiRequest<OccurrenceItem>(editor.item ? `/hr/occurrences/${editor.item.id}` : "/hr/occurrences", { method: editor.item ? "PATCH" : "POST", body: JSON.stringify(payload) });
      if (form.file) {
        const data = new FormData();
        data.append("file", form.file);
        await apiRequest(`/hr/occurrences/${occurrence.id}/documents`, { method: "POST", body: data });
      }
      return occurrence;
    },
    onSuccess: async () => {
      const employeeId = editor?.employeeId;
      setEditor(null);
      setForm(emptyOccurrenceForm());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr-occurrence-indicators"] }),
        queryClient.invalidateQueries({ queryKey: ["hr-employee", employeeId] })
      ]);
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/hr/occurrences/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr-occurrence-indicators"] })
  });

  const cards = query.data ? [
    { label: "Total de ocorrências", value: query.data.aggregate.total, bucket: "" },
    { label: "Faltas", value: (counts.get("JUSTIFIED_ABSENCE") ?? 0) + (counts.get("UNJUSTIFIED_ABSENCE") ?? 0), type: "FALTA" },
    { label: "Atestados", value: counts.get("MEDICAL_CERTIFICATE") ?? 0, bucket: "MEDICAL_CERTIFICATE" },
    { label: "Afastamentos", value: counts.get("LEAVE") ?? 0, bucket: "LEAVE" },
    { label: "Férias", value: counts.get("VACATION") ?? 0, bucket: "VACATION" },
    { label: "Advertências", value: counts.get("WARNING") ?? 0, bucket: "WARNING" },
    { label: "Suspensões", value: counts.get("SUSPENSION") ?? 0, bucket: "SUSPENSION" },
    { label: "Acidentes de trabalho", value: counts.get("WORK_ACCIDENT") ?? 0, bucket: "WORK_ACCIDENT" },
    { label: "Outros", value: counts.get("OTHER") ?? 0, bucket: "OTHER" }
  ] : [];

  return <div className="space-y-5">
    <HrSectionTabs />
    <HrPageHeader eyebrow="Recursos Humanos" title="Ocorrências" description="Histórico funcional por período, funcionário, unidade e tipo. Registros rejeitados e cancelados não entram nos totais." action={<div className="flex gap-2"><Link className="btn-secondary" to={`/recursos-humanos?${searchParams.toString()}`}>Voltar ao Pulso</Link>{canCreate ? <button className="btn-primary" onClick={() => { const filtered = searchParams.get("employeeId"); if (filtered) openCreate(filtered); else setEmployeePickerOpen(true); }}>Nova ocorrência</button> : null}</div>} />

    <section className="card p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-bold">De<input className="input mt-1" type="date" value={startDate} onChange={(event) => updateFilter("startDate", event.target.value)} /></label>
      <label className="text-xs font-bold">Até<input className="input mt-1" type="date" value={endDate} onChange={(event) => updateFilter("endDate", event.target.value)} /></label>
      <IndicatorSelect label="Empresa" value={searchParams.get("companyId") ?? ""} options={filtersQuery.data?.companies ?? []} onChange={(value) => updateFilter("companyId", value)} />
      <IndicatorSelect label="Unidade" value={searchParams.get("unitId") ?? ""} options={filtersQuery.data?.units ?? []} onChange={(value) => updateFilter("unitId", value)} />
      <IndicatorSelect label="Setor" value={searchParams.get("departmentId") ?? ""} options={filtersQuery.data?.departments ?? []} onChange={(value) => updateFilter("departmentId", value)} />
      <IndicatorSelect label="Funcionário" value={searchParams.get("employeeId") ?? ""} options={filtersQuery.data?.employees ?? []} onChange={(value) => updateFilter("employeeId", value)} />
      <label className="text-xs font-bold">Status<select className="select mt-1" value={searchParams.get("status") ?? ""} onChange={(event) => updateFilter("status", event.target.value)}><option value="">Ativos</option><option value="PENDENTE">Pendente</option><option value="EM_ANALISE">Em análise</option><option value="APROVADO">Aprovado</option><option value="REJEITADO">Rejeitado</option><option value="CANCELADO">Cancelado</option></select></label>
      <label className="text-xs font-bold">Tipo<select className="select mt-1" value={searchParams.get("bucket") ?? ""} onChange={(event) => updateFilter("bucket", event.target.value)}><option value="">Todos</option>{Object.entries(bucketLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div></section>

    {query.isLoading ? <div className="card p-10 text-center text-slate-500">Carregando ocorrências...</div> : null}
    {query.isError ? <div className="card border-red-200 bg-red-50 p-5 text-red-800">{(query.error as Error).message}</div> : null}
    {query.data ? <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{cards.map((card) => <IndicatorCard key={card.label} label={card.label} value={card.value} onClick={() => { const params = new URLSearchParams(searchParams); params.delete("bucket"); params.delete("type"); if (card.bucket) params.set("bucket", card.bucket); if (card.type) params.set("type", card.type); params.set("page", "1"); setSearchParams(params); }} />)}</section>
      <section className="grid gap-4 xl:grid-cols-2"><div className="card p-5"><SectionHeading title="Distribuição por tipo" />{query.data.aggregate.byType.length ? <Bars items={query.data.aggregate.byType.map((item) => ({ name: bucketLabels[item.key] ?? item.key, value: item.value }))} /> : <EmptyState />}</div><div className="card p-5"><SectionHeading title="Comparação por setor" />{query.data.aggregate.byDepartment.length ? <Bars items={query.data.aggregate.byDepartment} /> : <EmptyState />}</div></section>
      <section className="card p-5"><SectionHeading title="Registros" description={`${query.data.total} ocorrência(s), ordenadas da data mais recente para a mais antiga.`} />
        {!query.data.items.length ? <EmptyState /> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-3">Funcionário</th><th className="p-3">Setor</th><th className="p-3">Tipo</th><th className="p-3">Período</th><th className="p-3">Dias</th><th className="p-3">Status</th><th className="p-3">Responsável</th><th className="p-3 text-right">Ações</th></tr></thead><tbody>{query.data.items.map((item) => {
          const frequency = item.frequencyType ?? item.dailyAttendances[0]?.frequencyType;
          const editable = ["PENDENTE", "EM_ANALISE"].includes(item.status);
          return <tr key={item.id} className="border-b last:border-0"><td className="p-3"><p className="font-extrabold">{item.employee.name}</p><p className="text-xs text-slate-500">{item.employee.registration} · {item.employee.unitRef?.name ?? "Sem unidade"}</p></td><td className="p-3">{item.departmentNameSnapshot ?? item.employee.departmentRef?.name ?? item.employee.department ?? "Sem setor"}</td><td className="p-3 font-bold">{frequency?.name ?? item.type.replaceAll("_", " ")}</td><td className="p-3">{formatBrazilDate(item.startDate ?? item.date)}{item.endDate && dateInput(item.endDate) !== dateInput(item.startDate) ? ` a ${formatBrazilDate(item.endDate)}` : ""}</td><td className="p-3">{item.daysAway ?? 1}</td><td className="p-3"><StatusBadge tone={item.status === "APROVADO" ? "success" : item.status === "REJEITADO" || item.status === "CANCELADO" ? "danger" : "warning"}>{item.status.replaceAll("_", " ")}</StatusBadge></td><td className="p-3 text-slate-600">{item.registeredBy?.email ?? "—"}</td><td className="p-3"><div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setViewItem(item)}>Visualizar</button>{canEdit && editable ? <button className="btn-secondary" onClick={() => openEdit(item)}>Editar</button> : null}{canCancel && editable ? <button className="btn-danger" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm("Cancelar esta ocorrência preservando o histórico?")) cancelMutation.mutate(item.id); }}>Cancelar</button> : null}</div></td></tr>;
        })}</tbody></table></div>}
        {query.data.total > query.data.pageSize ? <div className="mt-4 flex items-center justify-end gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))}>Anterior</button><span className="text-sm font-bold">Página {page}</span><button className="btn-secondary" disabled={page * query.data.pageSize >= query.data.total} onClick={() => updateFilter("page", String(page + 1))}>Próxima</button></div> : null}
      </section>
    </> : null}

    {employeePickerOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><form className="w-full max-w-md rounded-[28px] bg-white p-6" onSubmit={(event) => { event.preventDefault(); if (pickedEmployeeId) openCreate(pickedEmployeeId); }}><h3 className="text-xl font-extrabold">Selecionar funcionário</h3><label className="mt-4 block text-xs font-bold">Funcionário<select required className="select mt-1" value={pickedEmployeeId} onChange={(event) => setPickedEmployeeId(event.target.value)}><option value="">Selecione</option>{filtersQuery.data?.employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.registration}</option>)}</select></label><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setEmployeePickerOpen(false)}>Cancelar</button><button className="btn-primary">Continuar</button></div></form></div> : null}
    {editor ? <OccurrenceEditor form={form} setForm={setForm} types={occurrenceTypes} reasons={reasonsQuery.data ?? []} employee={selectedEmployee?.name && selectedEmployee.registration ? { name: selectedEmployee.name, registration: selectedEmployee.registration } : editor.item?.employee} mutation={saveMutation} onClose={() => setEditor(null)} title={editor.item ? "Editar ocorrência" : "Nova ocorrência"} submitLabel={editor.item ? "Salvar alterações" : "Registrar ocorrência"} /> : null}
    {viewItem ? <OccurrenceDetails item={viewItem} onClose={() => setViewItem(null)} /> : null}
  </div>;
}

function IndicatorSelect({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold">{label}<select className="select mt-1" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name ?? option.tradeName ?? option.legalName}{option.registration ? ` · ${option.registration}` : ""}</option>)}</select></label>;
}

function IndicatorCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="card p-5 text-left transition hover:border-brand-300 hover:bg-brand-50"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-extrabold">{value}</p></button>;
}

function Bars({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <div className="space-y-3">{items.map((item) => <div key={item.name ?? item.date}><div className="mb-1 flex justify-between text-sm"><span className="font-bold">{item.name ?? item.date}</span><span>{item.value}</span></div><div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-700" style={{ width: `${item.value / max * 100}%` }} /></div></div>)}</div>;
}

function OccurrenceDetails({ item, onClose }: { item: OccurrenceItem; onClose: () => void }) {
  const frequency = item.frequencyType ?? item.dailyAttendances[0]?.frequencyType;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><section className="w-full max-w-xl rounded-[28px] bg-white p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-extrabold">{frequency?.name ?? item.type.replaceAll("_", " ")}</h3><p className="mt-1 text-sm text-slate-500">{item.employee.name} · {item.employee.registration}</p></div><StatusBadge tone={item.status === "APROVADO" ? "success" : item.status === "REJEITADO" || item.status === "CANCELADO" ? "danger" : "warning"}>{item.status.replaceAll("_", " ")}</StatusBadge></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Período</dt><dd className="font-bold">{formatBrazilDate(item.startDate ?? item.date)} a {formatBrazilDate(item.endDate ?? item.startDate ?? item.date)}</dd></div><div><dt className="text-slate-500">Duração</dt><dd className="font-bold">{item.daysAway ?? 1} dia(s)</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Descrição</dt><dd className="font-bold">{item.description}</dd></div>{item.notes ? <div className="sm:col-span-2"><dt className="text-slate-500">Observação</dt><dd>{item.notes}</dd></div> : null}{item.accidentLocation ? <div><dt className="text-slate-500">Local do acidente</dt><dd>{item.accidentLocation}</dd></div> : null}{item.catNumber ? <div><dt className="text-slate-500">CAT</dt><dd>{item.catNumber}</dd></div> : null}</dl><div className="mt-5 flex justify-end"><button className="btn-secondary" onClick={onClose}>Fechar</button></div></section></div>;
}

function EmptyState() {
  return <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">Sem ocorrências para os filtros selecionados.</div>;
}
