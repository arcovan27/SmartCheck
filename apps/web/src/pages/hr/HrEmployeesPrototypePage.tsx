import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, downloadProtectedDocument } from "../../lib/api";
import { useAuth, userHasPermission } from "../../lib/auth";
import { HrPageHeader, HrSectionTabs, MiniAvatar, SectionHeading, StatusBadge } from "./HrPrototypeComponents";
import { hrFeatures } from "../../config/hrFeatures";

type EmployeeListItem = { id: string; name: string; registration: string; department?: string; position?: string; email?: string; phone?: string; admissionDate?: string; isActive: boolean; inactiveEffectiveDate?: string; inactiveReason?: string; company?: { tradeName?: string; legalName: string }; unitRef?: { name: string }; departmentRef?: { name: string; deletedAt?: string | null }; positionRef?: { name: string }; team?: { name: string } };
type EpiMovement = { id: string; movementType: string; quantity: number; date: string; epi: { name: string; ca?: string } };
type Schedule = { id: string; startAt: string; endAt: string; status: string; shift?: { name: string }; team?: { name: string } };
type Attachment = { id: string; filename: string; mimeType: string; createdAt: string };
type Occurrence = { id: string; type: string; startDate: string; endDate?: string; hoursAway?: string; daysAway?: number; isJustified?: boolean; description: string; status: string; reason?: { name: string }; frequencyType?: { code: string; name: string; color: string }; attachments: Attachment[] };
type OccurrenceSummary = { aggregate: { total: number; byType: Array<{ key: string; value: number }> } };
type EmployeeDetails = EmployeeListItem & { cpf?: string; dismissalDate?: string; costCenter?: { name: string; code: string }; epiMovements: EpiMovement[]; schedules: Schedule[]; occurrences: Occurrence[]; capabilities: { canViewEpi: boolean; canViewSchedules: boolean; canViewOccurrences: boolean; canViewDocuments: boolean } };
type EmployeePage = { items: EmployeeListItem[]; total: number; page: number; pageSize: number; summary: { active: number; away: number } };
type EmployeeTab = "Resumo" | "EPI" | "Escala" | "Ocorrências";

const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const brDate = (date?: string) => date ? new Intl.DateTimeFormat("pt-BR").format(new Date(date)) : "⬝";
const brDateTime = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));
export const emptyOccurrenceForm = () => ({ idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, type: "FALTA", isJustified: false, frequencyCode: "FALTA_INJ", startDate: new Date().toISOString().slice(0, 10), endDate: "", description: "", notes: "", reasonId: "", file: null as File | null, accidentOccurredAt: "", accidentLocation: "", hasAccidentLeave: false, accidentLeaveStartDate: "", accidentLeaveEndDate: "", catNumber: "" });
export type OccurrenceReason = { id: string; name: string; occurrenceType: string; frequencyType?: { code: string; name: string } | null };

export function HrEmployeesPrototypePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState<EmployeeTab>("Resumo");
  const [showOccurrenceEditor, setShowOccurrence] = useState(false);
  const showOccurrence = false;
  const [form, setForm] = useState(emptyOccurrenceForm);
  const [occurrencePeriod, setOccurrencePeriod] = useState(() => { const today = new Date().toISOString().slice(0, 10); return { startDate: `${today.slice(0, 7)}-01`, endDate: today }; });
  const canRegisterOccurrence = userHasPermission(user, "OCCURRENCE_REGISTER");
  const employeesQuery = useQuery({ queryKey: ["hr-employees", page, search], queryFn: () => apiRequest<EmployeePage>(`/hr/employees?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`) });
  const reasonsQuery = useQuery({ queryKey: ["hr-occurrence-reasons", selectedId, form.frequencyCode], queryFn: () => apiRequest<OccurrenceReason[]>(`/hr/occurrences/reasons?employeeId=${selectedId}&frequencyCode=${form.frequencyCode}`), enabled: showOccurrenceEditor && Boolean(selectedId) });
  useEffect(() => { if (!selectedId && employeesQuery.data?.items[0]) setSelectedId(employeesQuery.data.items[0].id); }, [employeesQuery.data, selectedId]);
  const detailsQuery = useQuery({ queryKey: ["hr-employee", selectedId], queryFn: () => apiRequest<EmployeeDetails>(`/hr/employees/${selectedId}`), enabled: Boolean(selectedId) });
  const occurrenceSummaryQuery = useQuery({ queryKey: ["hr-employee-occurrence-summary", selectedId, occurrencePeriod], queryFn: () => apiRequest<OccurrenceSummary>(`/hr/occurrences/indicators?employeeId=${selectedId}&startDate=${occurrencePeriod.startDate}&endDate=${occurrencePeriod.endDate}&page=1&pageSize=1`), enabled: Boolean(selectedId) && tab === "Ocorrências" });
  const occurrenceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Selecione um funcionário");
      const occurrence = await apiRequest<Occurrence>("/hr/occurrences", { method: "POST", body: JSON.stringify({
        employeeId: selectedId, idempotencyKey: form.idempotencyKey, ...(form.frequencyCode === "OUTRO" ? { type: "OUTRO" } : { frequencyCode: form.frequencyCode }), startDate: `${form.startDate}T12:00:00-03:00`, endDate: form.endDate ? `${form.endDate}T12:00:00-03:00` : null,
        description: form.description, notes: form.notes || null, reasonId: form.reasonId || null,
        accidentOccurredAt: form.accidentOccurredAt ? new Date(form.accidentOccurredAt).toISOString() : null,
        accidentLocation: form.accidentLocation || null, hasAccidentLeave: form.frequencyCode === "ACID_TRAB" ? form.hasAccidentLeave : null,
        accidentLeaveStartDate: form.accidentLeaveStartDate ? `${form.accidentLeaveStartDate}T12:00:00-03:00` : null,
        accidentLeaveEndDate: form.accidentLeaveEndDate ? `${form.accidentLeaveEndDate}T12:00:00-03:00` : null, catNumber: form.catNumber || null,
        isJustified: form.frequencyCode !== "FALTA_INJ"
      }) });
      if (form.file) { const data = new FormData(); data.append("file", form.file); await apiRequest(`/hr/occurrences/${occurrence.id}/documents`, { method: "POST", body: data }); }
      return occurrence;
    },
    onSuccess: async () => { setShowOccurrence(false); setForm(emptyOccurrenceForm()); await queryClient.invalidateQueries({ queryKey: ["hr-employee", selectedId] }); },
  });
  const selected = detailsQuery.data;
  const occurrenceTypes = [
    { code: "FALTA_INJ", label: "Falta" },
    { code: "ATEST", label: "Atestado" },
    { code: "FERIAS", label: "Férias" },
    { code: "AUX_DOENCA", label: "Afastamento" },
    ...(userHasPermission(user, "WARNING_REGISTER") ? [{ code: "ADVERT", label: "Advertência" }] : []),
    ...(userHasPermission(user, "SUSPENSION_REGISTER") ? [{ code: "SUSP", label: "Suspensão" }] : []),
    ...(userHasPermission(user, "WORK_ACCIDENT_REGISTER") ? [{ code: "ACID_TRAB", label: "Acidente de trabalho" }] : []),
    { code: "OUTRO", label: "Outros" }
  ];
  const reasons = reasonsQuery.data ?? [];

  return <div className="space-y-5">
    <HrSectionTabs />
    <HrPageHeader eyebrow="Recursos Humanos · Funcionários" title="Uma ficha única para toda a jornada" description="Cadastro existente, EPIs e ocorrências consolidados com autorização por empresa e unidade." action={<Link to="/funcionarios" className="rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-brand-300">Gerenciar cadastros</Link>} />
    <div className="grid gap-4 xl:grid-cols-[340px,1fr]">
      <aside className="card h-fit p-4">
        <SectionHeading title="Funcionários" description={employeesQuery.data ? `${employeesQuery.data.total} registros · ${employeesQuery.data.summary.away} afastados` : "Carregando..."} />
        <input className="input mb-3" placeholder="Nome, matrícula ou setor" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        {employeesQuery.isError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{(employeesQuery.error as Error).message}</p> : null}
        <div className="space-y-2">{employeesQuery.data?.items.map((employee) => <button key={employee.id} onClick={() => { setSelectedId(employee.id); setTab("Resumo"); }} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${selectedId === employee.id ? "border-brand-300 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}><MiniAvatar initials={initials(employee.name)} /><div className="min-w-0 flex-1"><p className="truncate font-extrabold">{employee.name}</p><p className="truncate text-xs text-slate-500">{employee.registration} · {employee.departmentRef?.name ?? employee.department ?? "Sem setor"}</p></div><span className={`h-2.5 w-2.5 rounded-full ${employee.isActive ? "bg-emerald-500" : "bg-slate-400"}`} /></button>)}</div>
        <div className="mt-3 flex items-center justify-between"><button className="btn-secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="text-xs text-slate-500">Página {page}</span><button className="btn-secondary" disabled={!employeesQuery.data || page * 20 >= employeesQuery.data.total} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
      </aside>
      <main>{detailsQuery.isLoading ? <section className="card p-8 text-center text-slate-500">Carregando ficha...</section> : !selected ? <section className="card p-8 text-center text-slate-500">Selecione um funcionário.</section> : <section className="card overflow-hidden p-0">
        <div className="bg-gradient-to-r from-slate-950 to-brand-900 p-6 text-white"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="inline-flex h-20 w-20 items-center justify-center rounded-[26px] bg-white/10 text-2xl font-extrabold">{initials(selected.name)}</span><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-extrabold">{selected.name}</h3><StatusBadge tone={selected.isActive ? "success" : "neutral"}>{selected.isActive ? "Ativo" : "Inativo"}</StatusBadge></div><p className="text-slate-300">Matrícula {selected.registration} · {selected.positionRef?.name ?? selected.position ?? "Sem cargo"}</p><p className="text-sm text-slate-400">{selected.unitRef?.name ?? "Sem unidade"} · {selected.departmentRef?.name ?? selected.department ?? "Sem setor"}{selected.departmentRef?.deletedAt ? " (setor excluído)" : ""}</p></div><Link to="/funcionarios" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold">Editar cadastro</Link></div></div>
        <nav className="flex gap-1 overflow-x-auto border-b px-3 pt-3">{(["Resumo", "EPI", ...(hrFeatures.workScheduleEnabled ? ["Escala" as const] : []), "Ocorrências"] as EmployeeTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-t-xl px-4 py-3 text-sm font-extrabold ${tab === item ? "bg-brand-50 text-brand-800" : "text-slate-500"}`}>{item}</button>)}</nav>
        <div className="p-6">
          {tab === "Resumo" ? <div className="grid gap-5 md:grid-cols-2"><div><SectionHeading title="Dados profissionais" /><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Empresa</dt><dd className="font-bold">{selected.company?.tradeName ?? selected.company?.legalName ?? "⬝"}</dd></div><div><dt className="text-slate-500">Unidade</dt><dd className="font-bold">{selected.unitRef?.name ?? "⬝"}</dd></div><div><dt className="text-slate-500">Setor</dt><dd className="font-bold">{selected.departmentRef?.name ?? selected.department ?? "⬝"}{selected.departmentRef?.deletedAt ? " (setor excluído)" : ""}</dd></div><div><dt className="text-slate-500">Cargo</dt><dd className="font-bold">{selected.positionRef?.name ?? selected.position ?? "⬝"}</dd></div><div><dt className="text-slate-500">Equipe</dt><dd className="font-bold">{selected.team?.name ?? "⬝"}</dd></div><div><dt className="text-slate-500">Admissão</dt><dd className="font-bold">{brDate(selected.admissionDate)}</dd></div>{!selected.isActive ? <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Inativação</dt><dd className="font-bold">{selected.inactiveReason === "TERMINATED_BY_COMPANY" ? "Desligado pela empresa" : selected.inactiveReason === "VOLUNTARY_RESIGNATION" ? "Pedido de demissão pelo funcionário" : "Motivo não informado — registro anterior à atualização"} · {brDate(selected.inactiveEffectiveDate)}</dd></div> : null}</dl></div><div><SectionHeading title="Contato" /><p className="text-sm text-slate-500">E-mail</p><p className="font-bold">{selected.email ?? "⬝"}</p><p className="mt-3 text-sm text-slate-500">Telefone</p><p className="font-bold">{selected.phone ?? "⬝"}</p></div></div> : null}
          {tab === "EPI" ? <div><SectionHeading title="Histórico de EPI" description={`${selected.epiMovements.length} movimentações recentes`} />{!selected.capabilities.canViewEpi ? <p className="text-sm text-slate-500">Seu perfil não pode consultar EPIs.</p> : <div className="space-y-2">{selected.epiMovements.map((item) => <div key={item.id} className="flex justify-between rounded-2xl border p-4"><div><p className="font-extrabold">{item.epi.name}</p><p className="text-sm text-slate-500">CA {item.epi.ca ?? "⬝"} · {brDate(item.date)}</p></div><StatusBadge tone={item.movementType === "ENTREGA" ? "success" : "warning"}>{item.movementType} · {item.quantity}</StatusBadge></div>)}</div>}</div> : null}
          {hrFeatures.workScheduleEnabled && tab === "Escala" ? <div><SectionHeading title="Próximos turnos" description={`${selected.schedules.length} registros`} />{!selected.capabilities.canViewSchedules ? <p className="text-sm text-slate-500">Seu perfil não pode consultar escalas.</p> : <div className="grid gap-3 sm:grid-cols-2">{selected.schedules.map((item) => <div key={item.id} className="rounded-2xl border p-4"><p className="font-extrabold">{brDateTime(item.startAt)} ⬝ {brDateTime(item.endAt)}</p><p className="text-sm text-slate-500">{item.shift?.name ?? "Turno avulso"} · {item.team?.name ?? "Sem equipe"}</p></div>)}</div>}</div> : null}
          {tab === "Ocorrências" ? <div><SectionHeading title="Faltas, atestados e afastamentos" description="Documentos são protegidos e conteúdo clínico não é exibido." action={canRegisterOccurrence ? <button className="btn-primary" onClick={() => setShowOccurrence(true)}>Nova ocorrência</button> : undefined} /><EmployeeOccurrenceSummary period={occurrencePeriod} setPeriod={setOccurrencePeriod} data={occurrenceSummaryQuery.data} loading={occurrenceSummaryQuery.isLoading} />{!selected.capabilities.canViewOccurrences ? <p className="text-sm text-slate-500">Seu perfil não pode consultar ocorrências.</p> : <div className="space-y-3">{selected.occurrences.map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-extrabold">{item.frequencyType?.name ?? item.type.replaceAll("_", " ")}</p><p className="text-sm text-slate-500">{brDate(item.startDate)} a {brDate(item.endDate)} · {item.daysAway ?? 1} dia(s)</p><p className="mt-1 text-sm">{item.description}</p></div><StatusBadge tone={item.status === "APROVADO" ? "success" : item.status === "REJEITADO" ? "danger" : "warning"}>{item.status.replaceAll("_", " ")}</StatusBadge></div>{selected.capabilities.canViewDocuments && item.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((attachment) => <button className="btn-secondary" key={attachment.id} onClick={() => downloadProtectedDocument(attachment.id, attachment.filename)}>{attachment.filename}</button>)}</div> : null}</div>)}</div>}</div> : null}
        </div>
      </section>}</main>
    </div>
    {showOccurrenceEditor ? <OccurrenceEditor form={form} setForm={setForm} types={occurrenceTypes} reasons={reasons} employee={selected} mutation={occurrenceMutation} onClose={() => setShowOccurrence(false)} /> : null}
    {showOccurrence ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><form className="w-full max-w-xl rounded-[28px] bg-white p-6" onSubmit={(event) => { event.preventDefault(); occurrenceMutation.mutate(); }}><h3 className="text-xl font-extrabold">Registrar ocorrência</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Tipo<select className="select mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="FALTA">Falta</option><option value="ATESTADO_MEDICO">Atestado</option><option value="AFASTAMENTO">Afastamento</option><option value="FERIAS">Férias</option><option value="OUTRO">Outro</option></select></label><label className="text-xs font-bold">Justificada<select className="select mt-1" value={String(form.isJustified)} onChange={(e) => setForm({ ...form, isJustified: e.target.value === "true" })}><option value="false">Não</option><option value="true">Sim</option></select></label><label className="text-xs font-bold">Início<input required type="date" className="input mt-1" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label><label className="text-xs font-bold">Fim<input type="date" className="input mt-1" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label><label className="text-xs font-bold sm:col-span-2">Descrição<textarea required minLength={3} className="input mt-1 min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="text-xs font-bold sm:col-span-2">Atestado (PDF, JPG ou PNG; até 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="input mt-1" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} /></label></div>{occurrenceMutation.isError ? <p className="mt-3 text-sm text-red-700">{(occurrenceMutation.error as Error).message}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowOccurrence(false)}>Cancelar</button><button className="btn-primary" disabled={occurrenceMutation.isPending}>{occurrenceMutation.isPending ? "Salvando..." : "Registrar"}</button></div></form></div> : null}
  </div>;
}

function EmployeeOccurrenceSummary({ period, setPeriod, data, loading }: {
  period: { startDate: string; endDate: string };
  setPeriod: (value: { startDate: string; endDate: string }) => void;
  data?: OccurrenceSummary;
  loading: boolean;
}) {
  const counts = new Map(data?.aggregate.byType.map((item) => [item.key, item.value]) ?? []);
  return <div className="mb-5 rounded-2xl bg-slate-50 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Resumo de<input className="input mt-1" type="date" value={period.startDate} onChange={(event) => setPeriod({ ...period, startDate: event.target.value })} /></label><label className="text-xs font-bold">Até<input className="input mt-1" type="date" min={period.startDate} value={period.endDate} onChange={(event) => setPeriod({ ...period, endDate: event.target.value })} /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Total</p><strong>{loading ? "..." : data?.aggregate.total ?? 0}</strong></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Faltas</p><strong>{(counts.get("JUSTIFIED_ABSENCE") ?? 0) + (counts.get("UNJUSTIFIED_ABSENCE") ?? 0)}</strong></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Atestados</p><strong>{counts.get("MEDICAL_CERTIFICATE") ?? 0}</strong></div></div></div>;
}

export function OccurrenceEditor({ form, setForm, types, reasons, employee, mutation, onClose, title = "Nova ocorrência", submitLabel = "Registrar ocorrência" }: {
  form: ReturnType<typeof emptyOccurrenceForm>;
  setForm: (value: ReturnType<typeof emptyOccurrenceForm>) => void;
  types: Array<{ code: string; label: string }>;
  reasons: OccurrenceReason[];
  employee?: { name: string; registration: string };
  mutation: { mutate: () => void; isPending: boolean; isError: boolean; error: Error | null };
  onClose: () => void;
  title?: string;
  submitLabel?: string;
}) {
  const isWarning = form.frequencyCode === "ADVERT";
  const isSuspension = form.frequencyCode === "SUSP";
  const isAccident = form.frequencyCode === "ACID_TRAB";
  const needsReason = isWarning || isSuspension;
  const set = (field: keyof ReturnType<typeof emptyOccurrenceForm>, value: string | boolean | File | null) => setForm({ ...form, [field]: value });
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="occurrence-title">
    <form className="my-4 w-full max-w-2xl rounded-[28px] bg-white p-6" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <h3 id="occurrence-title" className="text-xl font-extrabold">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{employee?.name} · matrícula {employee?.registration}. A escala planejada será preservada.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Tipo<select required className="select mt-1" value={form.frequencyCode} onChange={(event) => setForm({ ...emptyOccurrenceForm(), frequencyCode: event.target.value, startDate: form.startDate })}>{types.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        {form.frequencyCode === "FALTA_INJ" || form.frequencyCode === "FALTA_JUST" ? <label className="text-xs font-bold">Justificativa<select className="select mt-1" value={form.frequencyCode} onChange={(event) => set("frequencyCode", event.target.value)}><option value="FALTA_INJ">Não justificada</option><option value="FALTA_JUST">Justificada</option></select></label> : null}
        {needsReason ? <label className="text-xs font-bold">Motivo padronizado<select required className="select mt-1" value={form.reasonId} onChange={(event) => set("reasonId", event.target.value)}><option value="">Selecione</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select>{!reasons.length ? <span className="mt-1 block text-[11px] text-amber-700">Cadastre um motivo compatível em Recursos Humanos → Cadastro.</span> : null}</label> : null}
        {!isAccident ? <label className="text-xs font-bold">{isWarning ? "Data da advertência" : "Data inicial"}<input required type="date" className="input mt-1" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></label> : null}
        {!isWarning && !isAccident ? <label className="text-xs font-bold">Data final<input required={isSuspension} type="date" min={form.startDate} className="input mt-1" value={form.endDate} onChange={(event) => set("endDate", event.target.value)} /></label> : null}
        {isAccident ? <><label className="text-xs font-bold">Data e hora do acidente<input required type="datetime-local" className="input mt-1" value={form.accidentOccurredAt} onChange={(event) => { setForm({ ...form, accidentOccurredAt: event.target.value, startDate: event.target.value.slice(0, 10) }); }} /></label><label className="text-xs font-bold">Local do acidente<input required className="input mt-1" value={form.accidentLocation} onChange={(event) => set("accidentLocation", event.target.value)} /></label><label className="text-xs font-bold">Houve afastamento?<select className="select mt-1" value={String(form.hasAccidentLeave)} onChange={(event) => set("hasAccidentLeave", event.target.value === "true")}><option value="false">Não</option><option value="true">Sim</option></select></label><label className="text-xs font-bold">Número da CAT (opcional)<input className="input mt-1" value={form.catNumber} onChange={(event) => set("catNumber", event.target.value)} /></label>{form.hasAccidentLeave ? <><label className="text-xs font-bold">Início do afastamento<input required type="date" className="input mt-1" value={form.accidentLeaveStartDate} onChange={(event) => set("accidentLeaveStartDate", event.target.value)} /></label><label className="text-xs font-bold">Fim previsto ou efetivo<input type="date" min={form.accidentLeaveStartDate} className="input mt-1" value={form.accidentLeaveEndDate} onChange={(event) => set("accidentLeaveEndDate", event.target.value)} /></label></> : null}</> : null}
        <label className="text-xs font-bold sm:col-span-2">{isWarning || isSuspension ? "Descrição da ocorrência" : isAccident ? "Descrição resumida" : "Descrição"}<textarea required minLength={3} maxLength={500} className="input mt-1 min-h-20" value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
        <label className="text-xs font-bold sm:col-span-2">Observação (opcional)<textarea maxLength={2000} className="input mt-1 min-h-16" value={form.notes} onChange={(event) => set("notes", event.target.value)} /></label>
        <label className="text-xs font-bold sm:col-span-2">Documento opcional (PDF, JPG ou PNG; até 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="input mt-1" onChange={(event) => set("file", event.target.files?.[0] ?? null)} /></label>
      </div>
      {(isSuspension || (isAccident && form.hasAccidentLeave)) ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Após aprovação, o sistema lançará o realizado apenas nos dias com escala de trabalho, sem apagar o planejamento. Conflitos ou competência fechada impedirão a aprovação.</p> : null}
      {mutation.isError ? <p className="mt-3 text-sm text-red-700">{mutation.error?.message}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={mutation.isPending || (needsReason && !form.reasonId)}>{mutation.isPending ? "Salvando..." : submitLabel}</button></div>
    </form>
  </div>;
}
