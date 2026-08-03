import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { useAuth, userHasPermission } from "../../lib/auth";
import { HrPageHeader, HrSectionTabs, SectionHeading, StatusBadge } from "./HrPrototypeComponents";

type CatalogItem = { id: string; companyId: string; name: string; code?: string; isActive: boolean; startMinute?: number; endMinute?: number; occurrenceType?: string; frequencyType?: { code: string; name: string } | null; unit?: { name: string }; department?: { name: string } };
type Catalogs = { units: CatalogItem[]; departments: CatalogItem[]; positions: CatalogItem[]; costCenters: CatalogItem[]; teams: CatalogItem[]; shifts: CatalogItem[]; absenceReasons: CatalogItem[] };
type Company = { id: string; legalName: string; tradeName?: string };
type CatalogKey = keyof Catalogs;
type DepartmentImpact = {
  department: CatalogItem;
  impact: { activeEmployees: number; activeTeams: number; activeAssignments: number; futureSchedules: number; employees: Array<{ id: string; name: string; registration: string }> };
  blockers: string[];
};

const definitions: Array<{ key: CatalogKey; endpoint: string; name: string; description: string }> = [
  { key: "units", endpoint: "units", name: "Unidades", description: "Filiais e locais operacionais" },
  { key: "departments", endpoint: "departments", name: "Setores", description: "Estrutura organizacional" },
  { key: "positions", endpoint: "positions", name: "Cargos e funções", description: "Funções exercidas pelos funcionários" },
  { key: "costCenters", endpoint: "cost-centers", name: "Centros de custo", description: "Alocação gerencial de despesas" },
  { key: "teams", endpoint: "teams", name: "Equipes", description: "Agrupamentos para escala" },
  { key: "shifts", endpoint: "shifts", name: "Turnos", description: "Horários, inclusive virada de dia" },
  { key: "absenceReasons", endpoint: "absence-reasons", name: "Motivos de ocorrência", description: "Motivos padronizados por tipo de ocorrência" }
];

const minuteTime = (value?: number) => value === undefined ? "" : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const toMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };

export function HrCatalogsPrototypePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogKey>("units");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [deleteForm, setDeleteForm] = useState({ confirmationName: "", reason: "", targetDepartmentId: "" });
  const [actionMessage, setActionMessage] = useState("");
  const [form, setForm] = useState({ companyId: "", name: "", code: "", startTime: "08:00", endTime: "17:00", frequencyCode: "FALTA_INJ" });
  const catalogsQuery = useQuery({ queryKey: ["hr-catalogs"], queryFn: () => apiRequest<Catalogs>("/hr/catalogs") });
  const companyQuery = useQuery({ queryKey: ["hr-dashboard-filters"], queryFn: () => apiRequest<{ companies: Company[] }>("/hr/dashboard/filters") });
  const definition = definitions.find((item) => item.key === selected)!;
  const items = useMemo(() => (catalogsQuery.data?.[selected] ?? []).filter((item) => `${item.name} ${item.code ?? ""}`.toLowerCase().includes(search.toLowerCase())), [catalogsQuery.data, selected, search]);
  const hasCatalogManage = userHasPermission(user, "CATALOG_MANAGE");
  const canCreate = hasCatalogManage || (selected === "departments" && userHasPermission(user, "DEPARTMENT_CREATE"));
  const canToggle = hasCatalogManage || (selected === "departments" && userHasPermission(user, "DEPARTMENT_DEACTIVATE"));
  const canDeleteDepartment = hasCatalogManage || userHasPermission(user, "DEPARTMENT_DELETE");

  const createMutation = useMutation({
    mutationFn: () => apiRequest(`/hr/catalogs/${definition.endpoint}`, { method: "POST", body: JSON.stringify({ companyId: form.companyId, name: form.name, code: form.code || null, ...(selected === "shifts" ? { startMinute: toMinutes(form.startTime), endMinute: toMinutes(form.endTime) } : {}), ...(selected === "absenceReasons" ? { frequencyCode: form.frequencyCode } : {}) }) }),
    onSuccess: async () => { setShowCreate(false); setForm({ ...form, name: "", code: "" }); await queryClient.invalidateQueries({ queryKey: ["hr-catalogs"] }); }
  });
  const toggleMutation = useMutation({
    mutationFn: (item: CatalogItem) => apiRequest(`/hr/catalogs/${definition.endpoint}/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr-catalogs"] })
  });
  const departmentImpactQuery = useQuery({
    queryKey: ["department-deletion-impact", deleteTarget?.id],
    queryFn: () => apiRequest<DepartmentImpact>(`/hr/catalogs/departments/${deleteTarget?.id}/deletion-impact`),
    enabled: Boolean(deleteTarget)
  });
  const deleteDepartmentMutation = useMutation({
    mutationFn: () => apiRequest<{ message: string }>(`/hr/catalogs/departments/${deleteTarget?.id}`, { method: "DELETE", body: JSON.stringify({ confirmationName: deleteForm.confirmationName, reason: deleteForm.reason, targetDepartmentId: deleteForm.targetDepartmentId || null }) }),
    onSuccess: async (result) => {
      setActionMessage(result.message);
      setDeleteTarget(null);
      setDeleteForm({ confirmationName: "", reason: "", targetDepartmentId: "" });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["hr-catalogs"] }), queryClient.invalidateQueries({ queryKey: ["hr-dashboard-filters"] })]);
    }
  });
  const operationalBlockers = Boolean(departmentImpactQuery.data && (departmentImpactQuery.data.impact.activeTeams || departmentImpactQuery.data.impact.activeAssignments || departmentImpactQuery.data.impact.futureSchedules));

  return <div className="space-y-5">
    <HrSectionTabs />
    <HrPageHeader eyebrow="Recursos Humanos · Cadastro" title="Cadastros auxiliares em um só lugar" description="Uma única fonte para estruturas organizacionais, equipes, turnos e motivos. A exclusão de setores é lógica e preserva todo o histórico." />
    {catalogsQuery.isError ? <div className="rounded-xl bg-red-50 p-4 text-red-700">{(catalogsQuery.error as Error).message}</div> : null}
    {actionMessage ? <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{actionMessage}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{definitions.map((item, index) => <button key={item.key} onClick={() => { setSelected(item.key); setSearch(""); }} className={`rounded-[24px] border p-5 text-left transition ${selected === item.key ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}><div className="flex justify-between"><span className="font-extrabold text-brand-800">{String(index + 1).padStart(2, "0")}</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold">{catalogsQuery.data?.[item.key].length ?? 0} itens</span></div><h3 className="mt-4 text-lg font-extrabold">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.description}</p></button>)}</section>
    <section className="card p-5">
      <SectionHeading title={definition.name} description={definition.description} action={<div className="flex gap-2"><input className="input w-56" placeholder="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} />{canCreate ? <button className="btn-primary" onClick={() => { setForm({ ...form, companyId: form.companyId || companyQuery.data?.companies[0]?.id || "" }); setShowCreate(true); }}>Novo</button> : null}</div>} />
      {catalogsQuery.isLoading ? <p className="py-10 text-center text-slate-500">Carregando cadastros...</p> : !items.length ? <p className="py-10 text-center text-slate-500">Nenhum item cadastrado.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-3">Nome</th><th className="p-3">Detalhes</th><th className="p-3">Status</th><th className="p-3 text-right">Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-extrabold">{item.name}</td><td className="p-3 text-slate-500">{selected === "shifts" ? `${minuteTime(item.startMinute)}→${minuteTime(item.endMinute)}` : selected === "absenceReasons" ? item.frequencyType?.name ?? item.occurrenceType?.replaceAll("_", " ") : item.code || item.unit?.name || item.department?.name || "—"}</td><td className="p-3"><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Ativo" : "Inativo"}</StatusBadge></td><td className="p-3 text-right"><div className="flex justify-end gap-2">{canToggle ? <button className="btn-secondary" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(item)}>{item.isActive ? "Inativar" : "Ativar"}</button> : null}{selected === "departments" && canDeleteDepartment ? <button className="btn-danger" onClick={() => { setActionMessage(""); setDeleteTarget(item); setDeleteForm({ confirmationName: "", reason: "", targetDepartmentId: "" }); }}>Excluir</button> : null}</div></td></tr>)}</tbody></table></div>}
    </section>
    <section className="grid gap-4 md:grid-cols-3"><div className="card p-5"><h3 className="font-extrabold">Uma única fonte</h3><p className="mt-2 text-sm text-slate-500">Setores, cargos e centros de custo são relacionados aos funcionários existentes.</p></div><div className="card p-5"><h3 className="font-extrabold">Escopo organizacional</h3><p className="mt-2 text-sm text-slate-500">Empresa e unidade são validadas também pelo backend.</p></div><div className="card p-5"><h3 className="font-extrabold">Histórico preservado</h3><p className="mt-2 text-sm text-slate-500">Setores excluídos continuam disponíveis apenas em consultas históricas.</p></div></section>

    {showCreate ? <CreateCatalogModal definition={definition} selected={selected} form={form} setForm={setForm} companies={companyQuery.data?.companies ?? []} mutation={createMutation} onClose={() => setShowCreate(false)} /> : null}
    {deleteTarget ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-department-title"><form className="w-full max-w-2xl rounded-[28px] bg-white p-6" onSubmit={(event) => { event.preventDefault(); deleteDepartmentMutation.mutate(); }}><h3 id="delete-department-title" className="text-xl font-extrabold">Excluir setor · {deleteTarget.name}</h3><p className="mt-2 text-sm text-slate-600">O setor desaparecerá das telas e seletores operacionais. Todo o histórico continuará preservado.</p>{departmentImpactQuery.isLoading ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">Verificando vínculos…</p> : null}{departmentImpactQuery.data ? <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"><p><strong>{departmentImpactQuery.data.impact.activeEmployees}</strong> funcionário(s) ativo(s)</p><p><strong>{departmentImpactQuery.data.impact.activeTeams}</strong> equipe(s) ativa(s)</p><p><strong>{departmentImpactQuery.data.impact.activeAssignments}</strong> atribuição(ões) ativa(s)</p><p><strong>{departmentImpactQuery.data.impact.futureSchedules}</strong> escala(s) futura(s)</p></div> : null}{operationalBlockers ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">Há vínculos operacionais que precisam ser encerrados antes da exclusão. Nenhum registro será alterado automaticamente.</p> : null}<div className="mt-4 grid gap-3"><label className="text-xs font-bold">Motivo da exclusão<input required minLength={3} maxLength={500} className="input mt-1" value={deleteForm.reason} onChange={(event) => setDeleteForm({ ...deleteForm, reason: event.target.value })} /></label>{departmentImpactQuery.data?.impact.activeEmployees ? <label className="text-xs font-bold">Transferir funcionários ativos para<select required className="select mt-1" value={deleteForm.targetDepartmentId} onChange={(event) => setDeleteForm({ ...deleteForm, targetDepartmentId: event.target.value })}><option value="">Selecione o setor de destino</option>{catalogsQuery.data?.departments.filter((item) => item.id !== deleteTarget.id && item.companyId === deleteTarget.companyId && item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<label className="text-xs font-bold">Digite “{deleteTarget.name}” para confirmar<input required className="input mt-1" value={deleteForm.confirmationName} onChange={(event) => setDeleteForm({ ...deleteForm, confirmationName: event.target.value })} /></label></div>{departmentImpactQuery.isError || deleteDepartmentMutation.isError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{((departmentImpactQuery.error ?? deleteDepartmentMutation.error) as Error).message}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="btn-danger" disabled={deleteDepartmentMutation.isPending || departmentImpactQuery.isLoading || deleteForm.confirmationName !== deleteTarget.name || operationalBlockers}>{deleteDepartmentMutation.isPending ? "Excluindo…" : "Confirmar exclusão"}</button></div></form></div> : null}
  </div>;
}

function CreateCatalogModal({ definition, selected, form, setForm, companies, mutation, onClose }: { definition: typeof definitions[number]; selected: CatalogKey; form: { companyId: string; name: string; code: string; startTime: string; endTime: string; frequencyCode: string }; setForm: (value: typeof form) => void; companies: Company[]; mutation: any; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><form className="w-full max-w-lg rounded-[28px] bg-white p-6" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><h3 className="text-xl font-extrabold">Novo item · {definition.name}</h3><div className="mt-4 grid gap-3"><label className="text-xs font-bold">Empresa<select required className="select mt-1" value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}><option value="">Selecione</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.tradeName ?? item.legalName}</option>)}</select></label><label className="text-xs font-bold">Nome<input required minLength={2} className="input mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>{selected !== "absenceReasons" && selected !== "teams" && selected !== "shifts" ? <label className="text-xs font-bold">Código{selected === "costCenters" ? " (obrigatório)" : ""}<input required={selected === "costCenters"} className="input mt-1" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label> : null}{selected === "shifts" ? <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Entrada<input required type="time" className="input mt-1" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label className="text-xs font-bold">Saída<input required type="time" className="input mt-1" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div> : null}{selected === "absenceReasons" ? <label className="text-xs font-bold">Tipo de ocorrência<select className="select mt-1" value={form.frequencyCode} onChange={(event) => setForm({ ...form, frequencyCode: event.target.value })}><option value="FALTA_INJ">Falta injustificada</option><option value="FALTA_JUST">Falta justificada</option><option value="ATEST">Atestado</option><option value="FERIAS">Férias</option><option value="AUX_DOENCA">Afastamento</option><option value="ADVERT">Advertência</option><option value="SUSP">Suspensão</option><option value="ACID_TRAB">Acidente de trabalho</option></select></label> : null}</div>{mutation.isError ? <p className="mt-3 text-sm text-red-700">{(mutation.error as Error).message}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</button></div></form></div>;
}
