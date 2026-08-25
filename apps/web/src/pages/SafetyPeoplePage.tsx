import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { SearchableSelect } from "../components/SearchableSelect";
import { apiRequest, getUploadedFileUrl, uploadFile } from "../lib/api";
import { formatBrazilDateTime } from "../lib/datetime";

type Employee = { id: string; name: string; department: string; position: string; hasActiveUser: boolean };
type Item = { id: string; label: string; section?: string | null; instruction?: string | null; itemType: "OK_PROBLEMA_NA" | "SIM_NAO" | "NUMERO" | "TEXTO"; required: boolean; allowsPhotoOnProblem: boolean; requiresPhotoOnProblem: boolean };
type Template = { id: string; name: string; description?: string | null; periodicity: string; isActive: boolean; items: Item[]; _count: { executions: number } };
type Meta = { templates: Template[]; employees: Employee[]; currentEmployeeId?: string | null; permissions: { view: boolean; execute: boolean; manage: boolean } };
type Answer = { optionResult?: string; booleanResult?: boolean; numericValue?: number; textValue?: string; observation?: string; attachmentIds: string[] };

const tabs = [
  { to: "/seguranca-pessoas", label: "DDS" },
  { to: "/seguranca-pessoas/realizar", label: "Realizar DDS" },
  { to: "/seguranca-pessoas/historico", label: "Histórico" },
];

function SafetyHeader({ operational = false }: { operational?: boolean }) {
  const location = useLocation();
  return <>
    <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-cyan-900 p-5 text-white shadow-xl sm:p-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-300">SmartCheck</p>
      <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{operational ? "Realizar DDS" : "Segurança e Pessoas"}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-200">Diálogo Diário de Segurança integrado aos funcionários, setores, participantes e evidências.</p>
    </header>
    {!operational ? <nav className="grid gap-2 sm:grid-cols-3" aria-label="Áreas de Segurança e Pessoas">
      {tabs.map((tab) => <Link key={tab.to} to={tab.to} className={clsx("min-h-12 rounded-2xl border px-4 py-3 text-center text-sm font-bold", location.pathname === tab.to ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-cyan-400")}>{tab.label}</Link>)}
    </nav> : null}
  </>;
}

export function SafetyPeoplePage() {
  const location = useLocation();
  const operational = location.pathname.startsWith("/operacao-arcovan/");
  const meta = useQuery({ queryKey: ["safety-people-meta"], queryFn: () => apiRequest<Meta>("/safety-people/dds/meta") });
  const section = operational || location.pathname.endsWith("/realizar") ? "execute" : location.pathname.endsWith("/historico") ? "history" : "dds";
  return <div className="min-w-0 space-y-5 overflow-x-hidden">
    <SafetyHeader operational={operational} />
    {meta.isError ? <p className="rounded-2xl bg-red-50 p-4 text-red-700">{(meta.error as Error).message}</p> : null}
    {meta.isLoading ? <p className="card text-center text-slate-500">Carregando Segurança e Pessoas…</p> : null}
    {meta.data && section === "dds" ? <DdsCatalog meta={meta.data} /> : null}
    {meta.data && section === "execute" ? <DdsExecution meta={meta.data} operational={operational} /> : null}
    {meta.data && section === "history" ? <DdsHistory meta={meta.data} /> : null}
  </div>;
}

function DdsCatalog({ meta }: { meta: Meta }) {
  const navigate = useNavigate();
  return <>
    <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="section-title">DDS disponíveis</h2><p className="text-sm text-slate-500">Selecione um diálogo para iniciar uma realização com o processo completo.</p></div>
      {meta.permissions.execute ? <button className="btn-primary min-h-12" onClick={() => navigate("/seguranca-pessoas/realizar")}>Realizar DDS</button> : null}
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {meta.templates.map((template) => <article className="card" key={template.id}>
        <div className="flex items-start justify-between gap-2"><h3 className="font-extrabold">{template.name}</h3><span className={clsx("badge", template.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700")}>{template.isActive ? "Ativo" : "Inativo"}</span></div>
        <p className="mt-2 text-sm text-slate-500">{template.description || "Diálogo Diário de Segurança"}</p>
        <p className="mt-3 text-sm"><strong>{template.items.length}</strong> pergunta(s) · <strong>{template._count.executions}</strong> realização(ões)</p>
        {template.isActive && meta.permissions.execute ? <button className="btn-secondary mt-4 w-full min-h-12" onClick={() => navigate(`/seguranca-pessoas/realizar?dds=${template.id}`)}>Iniciar este DDS</button> : null}
      </article>)}
    </section>
    {meta.permissions.manage ? <TemplateManager meta={meta} /> : null}
  </>;
}

function TemplateManager({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Array<Partial<Item>>>([{ label: "", section: "Perguntas", itemType: "OK_PROBLEMA_NA", required: true, allowsPhotoOnProblem: true, requiresPhotoOnProblem: false }]);
  const save = useMutation({
    mutationFn: () => apiRequest(editing ? `/safety-people/dds/templates/${editing.id}` : "/safety-people/dds/templates", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ name, description, periodicity: editing?.periodicity ?? "DIARIO", isActive: editing?.isActive ?? true, items }) }),
    onSuccess: () => { setEditing(null); setName(""); setDescription(""); setItems([{ label: "", section: "Perguntas", itemType: "OK_PROBLEMA_NA", required: true, allowsPhotoOnProblem: true, requiresPhotoOnProblem: false }]); queryClient.invalidateQueries({ queryKey: ["safety-people-meta"] }); },
  });
  function edit(template: Template) { setEditing(template); setName(template.name); setDescription(template.description ?? ""); setItems(template.items); }
  return <section className="card space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="section-title">Gerenciar modelos de DDS</h2><p className="text-sm text-slate-500">Modelos com histórico preservam as perguntas existentes.</p></div>{editing ? <button className="btn-secondary" onClick={() => { setEditing(null); setName(""); setDescription(""); }}>Cancelar edição</button> : null}</div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Título<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-sm font-semibold">Tema ou descrição<input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} /></label></div>
    <div className="space-y-2">{items.map((item, index) => <div className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr,180px]" key={item.id ?? index}><input className="input" placeholder={`Pergunta ${index + 1}`} value={item.label ?? ""} onChange={(e) => setItems(items.map((current, position) => position === index ? { ...current, label: e.target.value } : current))} /><select className="select" value={item.itemType} disabled={Boolean(item.id)} onChange={(e) => setItems(items.map((current, position) => position === index ? { ...current, itemType: e.target.value as Item["itemType"] } : current))}><option value="OK_PROBLEMA_NA">OK / Problema / N/A</option><option value="SIM_NAO">Sim / Não</option><option value="NUMERO">Número</option><option value="TEXTO">Texto</option></select></div>)}</div>
    {!editing ? <button className="btn-secondary" onClick={() => setItems([...items, { label: "", section: "Perguntas", itemType: "OK_PROBLEMA_NA", required: true, allowsPhotoOnProblem: true, requiresPhotoOnProblem: false }])}>Adicionar pergunta</button> : null}
    <button className="btn-primary" disabled={save.isPending || !name.trim() || items.some((item) => !item.label?.trim())} onClick={() => save.mutate()}>{save.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Criar modelo de DDS"}</button>
    {save.isError ? <p className="text-sm text-red-700">{(save.error as Error).message}</p> : null}
    <div className="flex flex-wrap gap-2 border-t pt-4">{meta.templates.map((template) => <button className="btn-secondary" key={template.id} onClick={() => edit(template)}>Editar {template.name}</button>)}</div>
  </section>;
}

function DdsExecution({ meta, operational = false }: { meta: Meta; operational?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initialTemplate = new URLSearchParams(location.search).get("dds") ?? "";
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [responsibleId, setResponsibleId] = useState(meta.currentEmployeeId ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(meta.currentEmployeeId ? [meta.currentEmployeeId] : []);
  const [participantSearch, setParticipantSearch] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const selected = meta.templates.find((template) => template.id === templateId);
  useEffect(() => { setAnswers({}); setMessage(""); }, [templateId]);
  const create = useMutation({
    mutationFn: () => apiRequest<any>("/checklist-executions", { method: "POST", body: JSON.stringify({ templateId, equipmentId: null, employeeId: responsibleId, participantIds, operatorName: meta.employees.find((employee) => employee.id === responsibleId)?.name, notes, items: selected?.items.map((item) => ({ templateItemId: item.id, ...answers[item.id], attachmentIds: answers[item.id]?.attachmentIds ?? [] })) }) }),
    onSuccess: (result) => { setMessage(`DDS concluído com sucesso. Registro ${result.id}.`); setAnswers({}); setNotes(""); queryClient.invalidateQueries({ queryKey: ["safety-people-meta"] }); if (!operational) window.setTimeout(() => navigate("/seguranca-pessoas/historico"), 1200); },
  });
  const filteredEmployees = useMemo(() => { const term = participantSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); return meta.employees.filter((employee) => `${employee.name} ${employee.department}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term)); }, [meta.employees, participantSearch]);
  function update(itemId: string, patch: Partial<Answer>) { setAnswers((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch, attachmentIds: patch.attachmentIds ?? current[itemId]?.attachmentIds ?? [] } })); }
  async function attach(itemId: string, file?: File | null) { if (!file) return; const uploaded = await uploadFile(file); update(itemId, { attachmentIds: [...(answers[itemId]?.attachmentIds ?? []), uploaded.id] }); }
  function submit(event: FormEvent) { event.preventDefault(); setMessage(""); if (!selected || !responsibleId || participantIds.length === 0) { setMessage("Selecione o DDS, o responsável e ao menos um participante."); return; } create.mutate(); }
  if (!meta.permissions.execute) return <p className="card text-amber-800">Seu perfil pode consultar DDS, mas não possui permissão para realizar.</p>;
  return <form className="space-y-4" onSubmit={submit}>
    <section className="card space-y-4"><div><h2 className="section-title">Realizar DDS</h2><p className="text-sm text-slate-500">O registro não possui vínculo com máquina ou equipamento.</p></div>
      <SearchableSelect id="dds-template" label="Selecione o DDS" value={templateId} options={meta.templates.filter((template) => template.isActive).map((template) => ({ value: template.id, label: template.name }))} onChange={setTemplateId} placeholder="Pesquisar DDS" required />
      <SearchableSelect id="dds-responsible" label="Responsável pelo DDS" value={responsibleId} options={meta.employees.filter((employee) => meta.permissions.manage || employee.id === meta.currentEmployeeId).map((employee) => ({ value: employee.id, label: `${employee.name} — ${employee.department}` }))} onChange={setResponsibleId} placeholder="Pesquisar responsável" required />
      <fieldset className="min-w-0 rounded-2xl border p-3"><legend className="px-2 text-sm font-bold">Participantes</legend><input className="input mb-2 w-full" type="search" placeholder="Pesquisar funcionário ou setor" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} /><div className="max-h-64 touch-pan-y space-y-1 overflow-y-auto overscroll-contain">{filteredEmployees.map((employee) => <label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-slate-50" key={employee.id}><input className="h-5 w-5 shrink-0" type="checkbox" checked={participantIds.includes(employee.id)} onChange={() => setParticipantIds((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} /><span className="min-w-0"><strong className="block break-words">{employee.name}</strong><small className="text-slate-500">{employee.department}</small></span></label>)}</div><p className="mt-2 text-xs text-slate-500">{participantIds.length} participante(s) selecionado(s)</p></fieldset>
    </section>
    {selected ? <section className="card space-y-5"><div><h2 className="section-title">{selected.name}</h2><p className="text-sm text-slate-500">{selected.description}</p></div>{selected.items.map((item, index) => <article className="rounded-2xl border p-4" key={item.id}><p className="font-bold">{index + 1}. {item.label}{item.required ? " *" : ""}</p>{item.instruction ? <p className="mt-1 text-sm text-slate-500">{item.instruction}</p> : null}<AnswerField item={item} value={answers[item.id]} onChange={(patch) => update(item.id, patch)} /><label className="mt-3 block text-sm font-semibold">Observação<input className="input mt-1" value={answers[item.id]?.observation ?? ""} onChange={(e) => update(item.id, { observation: e.target.value })} /></label>{item.allowsPhotoOnProblem ? <label className="mt-3 block min-h-12 cursor-pointer rounded-xl border border-dashed p-3 text-sm font-semibold">Adicionar foto ou evidência<input className="mt-2 block w-full" type="file" accept="image/*,.pdf" capture="environment" onChange={(e) => attach(item.id, e.target.files?.[0])} /></label> : null}{answers[item.id]?.attachmentIds.length ? <p className="mt-2 text-sm text-emerald-700">{answers[item.id].attachmentIds.length} anexo(s) preparado(s)</p> : null}</article>)}<label className="block text-sm font-semibold">Observações gerais<textarea className="input mt-1 min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} /></label><button className="btn-primary min-h-12 w-full sm:w-auto" disabled={create.isPending}>{create.isPending ? "Salvando DDS…" : "Concluir DDS"}</button>{message ? <p className={create.isError ? "text-red-700" : "text-emerald-700"}>{create.isError ? (create.error as Error).message : message}</p> : null}{create.isError && !message ? <p className="text-red-700">{(create.error as Error).message}</p> : null}</section> : null}
  </form>;
}

function AnswerField({ item, value, onChange }: { item: Item; value?: Answer; onChange: (patch: Partial<Answer>) => void }) {
  if (item.itemType === "OK_PROBLEMA_NA") return <div className="mt-3 grid gap-2 sm:grid-cols-4">{[["OK", "OK"], ["SEM_USO", "Sem uso"], ["PROBLEMA", "Problema"], ["NA", "N/A"]].map(([result, label]) => <button type="button" className={clsx("min-h-12 rounded-xl border font-semibold", value?.optionResult === result ? "border-cyan-700 bg-cyan-700 text-white" : "bg-white")} onClick={() => onChange({ optionResult: result })} key={result}>{label}</button>)}</div>;
  if (item.itemType === "SIM_NAO") return <div className="mt-3 grid grid-cols-2 gap-2">{[[true, "Sim"], [false, "Não"]] .map(([result, label]) => <button type="button" className={clsx("min-h-12 rounded-xl border font-semibold", value?.booleanResult === result ? "border-cyan-700 bg-cyan-700 text-white" : "bg-white")} onClick={() => onChange({ booleanResult: result as boolean })} key={String(result)}>{label as string}</button>)}</div>;
  if (item.itemType === "NUMERO") return <input className="input mt-3" type="number" inputMode="decimal" value={value?.numericValue ?? ""} onChange={(e) => onChange({ numericValue: e.target.value ? Number(e.target.value) : undefined })} />;
  return <textarea className="input mt-3 min-h-20" value={value?.textValue ?? ""} onChange={(e) => onChange({ textValue: e.target.value })} />;
}

function DdsHistory({ meta }: { meta: Meta }) {
  const [filters, setFilters] = useState({ search: "", from: "", to: "", templateId: "", responsibleId: "", participantId: "", department: "", status: "", page: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, String(value)); }); params.set("pageSize", "20");
  const list = useQuery({ queryKey: ["safety-people-history", filters], queryFn: () => apiRequest<any>(`/safety-people/dds?${params}`) });
  const detail = useQuery({ queryKey: ["safety-people-detail", selectedId], queryFn: () => apiRequest<any>(`/safety-people/dds/${selectedId}`), enabled: Boolean(selectedId) });
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, ...patch, page: patch.page ?? 1 });
  return <>
    <section className="card space-y-3"><div><h2 className="section-title">Histórico de DDS</h2><p className="text-sm text-slate-500">Consulte responsáveis, participantes, setores, respostas e evidências.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><input className="input" placeholder="DDS, responsável ou participante" value={filters.search} onChange={(e) => set({ search: e.target.value })} /><input className="input" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /><input className="input" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /><select className="select" value={filters.status} onChange={(e) => set({ status: e.target.value })}><option value="">Todas as situações</option><option value="REGISTRADO">Registrado</option><option value="COM_APONTAMENTO">Com apontamento</option></select><select className="select" value={filters.templateId} onChange={(e) => set({ templateId: e.target.value })}><option value="">Todos os DDS</option>{meta.templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select><select className="select" value={filters.responsibleId} onChange={(e) => set({ responsibleId: e.target.value })}><option value="">Todos os responsáveis</option>{meta.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select><select className="select" value={filters.participantId} onChange={(e) => set({ participantId: e.target.value })}><option value="">Todos os participantes</option>{meta.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select><input className="input" placeholder="Setor" value={filters.department} onChange={(e) => set({ department: e.target.value })} /></div></section>
    <section className="card"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="section-title">Execuções</h2><p className="text-sm text-slate-500">{list.data?.total ?? 0} registro(s)</p></div><div className="flex items-center gap-2"><button className="btn-secondary" disabled={filters.page <= 1} onClick={() => set({ page: filters.page - 1 })}>Anterior</button><span className="text-sm">{list.data?.page ?? 1}/{list.data?.totalPages ?? 1}</span><button className="btn-secondary" disabled={filters.page >= (list.data?.totalPages ?? 1)} onClick={() => set({ page: filters.page + 1 })}>Próxima</button></div></div>{list.isLoading ? <p className="py-8 text-center text-slate-500">Carregando histórico…</p> : null}<div className="grid gap-3 lg:grid-cols-2">{list.data?.items.map((item: any) => <button className="rounded-2xl border p-4 text-left hover:border-cyan-500" type="button" key={item.id} onClick={() => setSelectedId(item.id)}><div className="flex items-start justify-between gap-2"><div><h3 className="font-extrabold">{item.title}</h3><p className="text-sm text-slate-500">{formatBrazilDateTime(item.executedAt)}</p></div><span className={clsx("badge", item.hadProblem ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{item.hadProblem ? "Com apontamento" : "Registrado"}</span></div><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Responsável</dt><dd className="font-semibold">{item.responsible.name}</dd></div><div><dt className="text-slate-500">Setores</dt><dd className="font-semibold">{item.departments.join(", ") || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Participantes</dt><dd className="font-semibold">{item.participants.map((participant: any) => participant.name).join(", ") || "—"}</dd></div><div><dt className="text-slate-500">Conteúdo</dt><dd>{item.responseCount} respostas · {item.attachmentCount} anexos</dd></div></dl></button>)}</div></section>
    {selectedId ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}><section className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"><header className="flex items-center justify-between border-b p-4"><div><h2 className="text-xl font-extrabold">{detail.data?.template?.name ?? "DDS"}</h2><p className="text-sm text-slate-500">Registro completo</p></div><button className="min-h-11 min-w-11 rounded-xl border text-xl" onClick={() => setSelectedId(null)} aria-label="Fechar">×</button></header><div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>{detail.isLoading ? <p>Carregando…</p> : detail.data ? <DdsDetail data={detail.data} /> : null}</div></section></div> : null}
  </>;
}

function answer(item: any) { if (item.optionResult) return item.optionResult.replaceAll("_", " "); if (item.booleanResult !== null && item.booleanResult !== undefined) return item.booleanResult ? "Sim" : "Não"; if (item.numericValue !== null && item.numericValue !== undefined) return String(item.numericValue); return item.textValue || "—"; }
function DdsDetail({ data }: { data: any }) { return <div className="space-y-5"><dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs uppercase text-slate-500">Tema</dt><dd className="font-semibold">{data.template.description || "Diálogo Diário de Segurança"}</dd></div><div><dt className="text-xs uppercase text-slate-500">Responsável</dt><dd className="font-semibold">{data.employee.name}</dd></div><div><dt className="text-xs uppercase text-slate-500">Data e hora</dt><dd className="font-semibold">{formatBrazilDateTime(data.executedAt)}</dd></div><div className="sm:col-span-2"><dt className="text-xs uppercase text-slate-500">Participantes e setores no momento da execução</dt><dd className="font-semibold">{data.participants.map((participant: any) => `${participant.name} (${participant.department || "sem setor"})`).join(", ")}</dd></div><div><dt className="text-xs uppercase text-slate-500">Usuário do lançamento</dt><dd className="font-semibold">{data.launchedBy?.email || "Registro legado preservado"}</dd></div></dl><section><h3 className="font-extrabold">Respostas</h3><div className="mt-2 space-y-2">{data.items.map((item: any) => <article className="rounded-xl border p-3" key={item.id}><p className="font-semibold">{item.templateItem.label}</p><p className="mt-1 text-sm">Resposta: {answer(item)}</p>{item.observation ? <p className="text-sm text-slate-600">Observação: {item.observation}</p> : null}{item.attachments.length ? <div className="mt-2 flex flex-wrap gap-2">{item.attachments.map((attachment: any) => <a className="btn-secondary" href={getUploadedFileUrl(attachment.path) ?? "#"} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.filename}</a>)}</div> : null}</article>)}</div></section><section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border p-4"><h3 className="font-extrabold">Observações</h3><p className="mt-2 text-sm">{data.notes || "Nenhuma observação."}</p></div><div className="rounded-2xl border p-4"><h3 className="font-extrabold">Assinaturas</h3><p className="mt-2 text-sm">{data.signatures.length ? `${data.signatures.length} assinatura(s)` : "Nenhuma assinatura registrada."}</p></div></section><section><h3 className="font-extrabold">Auditoria</h3>{data.history.map((event: any) => <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm" key={`${event.action}-${event.at}`}>{event.action === "DDS_REGISTERED" ? "DDS registrado" : "DDS atualizado"} · {formatBrazilDateTime(event.at)} · {event.user || event.employee}</p>)}</section></div>; }
