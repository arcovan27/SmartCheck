import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, getUploadedFileUrl } from "../../lib/api";
import { formatBrazilDateTime } from "../../lib/datetime";
import { HrPageHeader, HrSectionTabs, StatusBadge } from "./HrPrototypeComponents";

type DdsListItem = {
  id: string;
  title: string;
  topic?: string | null;
  executedAt: string;
  registeredAt: string;
  responsible: { id: string; name: string };
  participants: string[];
  department?: string | null;
  notes?: string | null;
  hadProblem: boolean;
  responseCount: number;
  attachmentCount: number;
  launchedBy?: { id?: string | null; email?: string | null } | null;
};

type DdsListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  templates: Array<{ id: string; name: string; description?: string | null; isActive: boolean; _count: { executions: number; items: number } }>;
  items: DdsListItem[];
};

function answerFor(item: any) {
  if (item.optionResult) return item.optionResult.replaceAll("_", " ");
  if (item.booleanResult !== null && item.booleanResult !== undefined) return item.booleanResult ? "Sim" : "Não";
  if (item.numericValue !== null && item.numericValue !== undefined) return String(item.numericValue);
  return item.textValue || "—";
}

export function HrDdsPage() {
  const [filters, setFilters] = useState({ search: "", from: "", to: "", page: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(filters.page));
  params.set("pageSize", "20");

  const listQuery = useQuery({
    queryKey: ["hr-dds", filters],
    queryFn: () => apiRequest<DdsListResponse>(`/hr/dds?${params}`),
  });
  const detailQuery = useQuery({
    queryKey: ["hr-dds-detail", selectedId],
    queryFn: () => apiRequest<any>(`/hr/dds/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <HrPageHeader
        eyebrow="Recursos Humanos · Cadastro"
        title="DDS — Diálogo Diário de Segurança"
        description="Consulta preservada dos diálogos, participantes, respostas e evidências registradas."
        action={
          <Link className="btn-secondary" to="/recursos-humanos/cadastros">
            Voltar ao Cadastro
          </Link>
        }
      />

      <section className="card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold lg:col-span-2">
            Buscar DDS, responsável ou setor
            <input
              className="input mt-1"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })}
            />
          </label>
          <label className="text-sm font-semibold">
            Data inicial
            <input type="date" className="input mt-1" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value, page: 1 })} />
          </label>
          <label className="text-sm font-semibold">
            Data final
            <input type="date" className="input mt-1" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value, page: 1 })} />
          </label>
        </div>
      </section>

      {listQuery.isError ? <div className="rounded-xl bg-red-50 p-4 text-red-700">{(listQuery.error as Error).message}</div> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(listQuery.data?.templates ?? []).map((template) => (
          <article className="card" key={template.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-extrabold">{template.name}</h2>
              <StatusBadge tone={template.isActive ? "success" : "neutral"}>{template.isActive ? "Ativo" : "Inativo"}</StatusBadge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{template.description || "Diálogo Diário de Segurança"}</p>
            <p className="mt-3 text-sm"><strong>{template._count.executions}</strong> execução(ões) · <strong>{template._count.items}</strong> pergunta(s)</p>
          </article>
        ))}
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Histórico de DDS</h2>
            <p className="text-sm text-slate-500">{listQuery.data?.total ?? 0} registro(s) preservado(s)</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button className="btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Anterior</button>
            <span>Página {listQuery.data?.page ?? 1} de {listQuery.data?.totalPages ?? 1}</span>
            <button className="btn-secondary" disabled={filters.page >= (listQuery.data?.totalPages ?? 1)} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Próxima</button>
          </div>
        </div>
        {listQuery.isLoading ? <p className="py-10 text-center text-slate-500">Carregando registros de DDS…</p> : null}
        {!listQuery.isLoading && !listQuery.data?.items.length ? <p className="py-10 text-center text-slate-500">Nenhum DDS encontrado para os filtros.</p> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {(listQuery.data?.items ?? []).map((item) => (
            <button type="button" className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-brand-400" key={item.id} onClick={() => setSelectedId(item.id)}>
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-extrabold">{item.title}</h3><p className="text-sm text-slate-500">{formatBrazilDateTime(item.executedAt)}</p></div>
                <StatusBadge tone={item.hadProblem ? "warning" : "success"}>{item.hadProblem ? "Com apontamento" : "Registrado"}</StatusBadge>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Responsável</dt><dd className="font-semibold">{item.responsible.name}</dd></div>
                <div><dt className="text-slate-500">Setor</dt><dd className="font-semibold">{item.department || "—"}</dd></div>
                <div><dt className="text-slate-500">Participantes</dt><dd className="font-semibold">{item.participants.join(", ") || "—"}</dd></div>
                <div><dt className="text-slate-500">Conteúdo</dt><dd className="font-semibold">{item.responseCount} respostas · {item.attachmentCount} anexos</dd></div>
              </dl>
            </button>
          ))}
        </div>
      </section>

      {selectedId ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dds-detail-title" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <section className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
            <header className="flex items-start justify-between gap-3 border-b p-4">
              <div><h2 id="dds-detail-title" className="text-xl font-extrabold">{detailQuery.data?.template?.name ?? "DDS"}</h2><p className="text-sm text-slate-500">{detailQuery.data ? formatBrazilDateTime(detailQuery.data.executedAt) : "Carregando…"}</p></div>
              <button type="button" className="min-h-11 min-w-11 rounded-xl border text-xl" aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}>×</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
              {detailQuery.isError ? <p className="rounded-xl bg-red-50 p-3 text-red-700">{(detailQuery.error as Error).message}</p> : null}
              {detailQuery.isLoading ? <p className="py-10 text-center text-slate-500">Carregando DDS…</p> : null}
              {detailQuery.data ? <DdsDetail execution={detailQuery.data} /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DdsDetail({ execution }: { execution: any }) {
  return <div className="space-y-5">
    <dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs uppercase text-slate-500">Tema ou descrição</dt><dd className="font-semibold">{execution.template.description || "Diálogo Diário de Segurança"}</dd></div>
      <div><dt className="text-xs uppercase text-slate-500">Responsável</dt><dd className="font-semibold">{execution.employee.name}</dd></div>
      <div><dt className="text-xs uppercase text-slate-500">Setor</dt><dd className="font-semibold">{execution.departmentNameSnapshot || "—"}</dd></div>
      <div><dt className="text-xs uppercase text-slate-500">Participantes</dt><dd className="font-semibold">{execution.participants.join(", ") || "—"}</dd></div>
      <div><dt className="text-xs uppercase text-slate-500">Usuário do lançamento</dt><dd className="font-semibold">{execution.launchedBy?.email || execution.employee.name}</dd></div>
      <div><dt className="text-xs uppercase text-slate-500">Data e hora do registro</dt><dd className="font-semibold">{formatBrazilDateTime(execution.createdAt)}</dd></div>
    </dl>
    <section><h3 className="font-extrabold">Respostas registradas</h3><div className="mt-2 space-y-2">{execution.items.map((item: any) => <article className="rounded-xl border p-3" key={item.id}><p className="font-semibold">{item.templateItem.label}</p><p className="mt-1 text-sm">Resposta: {answerFor(item)}</p>{item.observation ? <p className="mt-1 text-sm text-slate-600">Observação: {item.observation}</p> : null}{item.attachments.length ? <div className="mt-2 flex flex-wrap gap-2">{item.attachments.map((attachment: any) => <a className="btn-secondary" href={getUploadedFileUrl(attachment.path) ?? "#"} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.filename}</a>)}</div> : null}</article>)}</div></section>
    <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border p-4"><h3 className="font-extrabold">Observações</h3><p className="mt-2 text-sm text-slate-600">{execution.notes || "Nenhuma observação registrada."}</p></div><div className="rounded-2xl border p-4"><h3 className="font-extrabold">Assinaturas</h3><p className="mt-2 text-sm text-slate-600">{execution.signatures.length ? `${execution.signatures.length} assinatura(s)` : "Nenhuma assinatura registrada neste legado."}</p></div></section>
    <section><h3 className="font-extrabold">Histórico da execução</h3><div className="mt-2 space-y-2">{execution.history.map((event: any) => <div className="rounded-xl bg-slate-50 p-3 text-sm" key={`${event.action}-${event.at}`}><strong>{event.action === "DDS_REGISTERED" ? "DDS registrado" : "DDS atualizado"}</strong><p>{formatBrazilDateTime(event.at)} · {event.user || event.employee}</p></div>)}</div></section>
  </div>;
}
