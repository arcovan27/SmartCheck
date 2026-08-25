import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { apiRequest, getUploadedFileUrl, uploadFile } from "../lib/api";
import { SearchableSelect } from "../components/SearchableSelect";
import { MaintenanceKanban } from "../components/MaintenanceKanban";

const areas = [
  ["dashboard", "Dashboard"],
  ["orders", "Ordens de Manutenção"],
  ["preventive", "Manutenções Preventivas"],
  ["equipment", "Equipamentos"],
  ["outsourced", "Empresas Terceirizadas"],
  ["history", "Histórico"],
] as const;
const statuses = [
  "ABERTA",
  "PLANEJADA",
  "EM_ANDAMENTO",
  "PENDENTE",
  "CONCLUIDA",
];
const statusLabel: Record<string, string> = {
  ABERTA: "Aberta",
  PLANEJADA: "Planejada",
  EM_ANDAMENTO: "Em andamento",
  PENDENTE: "Pendente",
  CONCLUIDA: "Concluída",
};
const allowedTargets = (status: string) => status === "CONCLUIDA"
  ? ["CONCLUIDA"]
  : statuses;

function moveOrderInCache(items: any[], id: string, targetStatus: string, targetPosition: number) {
  const moving = items.find((item) => item.id === id);
  if (!moving) return items;
  const sourceStatus = moving.status;
  const without = items.filter((item) => item.id !== id);
  const target = without
    .filter((item) => item.status === targetStatus)
    .sort((a, b) => (a.kanbanPosition ?? 0) - (b.kanbanPosition ?? 0));
  target.splice(Math.min(targetPosition, target.length), 0, { ...moving, status: targetStatus });
  const targetMap = new Map(target.map((item, index) => [item.id, { ...item, kanbanPosition: index }]));
  const source = without
    .filter((item) => item.status === sourceStatus && sourceStatus !== targetStatus)
    .sort((a, b) => (a.kanbanPosition ?? 0) - (b.kanbanPosition ?? 0));
  const sourceMap = new Map(source.map((item, index) => [item.id, { ...item, kanbanPosition: index }]));
  return without.map((item) => targetMap.get(item.id) ?? sourceMap.get(item.id) ?? item)
    .concat(targetMap.get(id) ?? []);
}
const priorityLabel: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Normal (legado)",
  NORMAL: "Normal",
  ALTA: "Alta",
  CRITICA: "Crítica",
};
const typeLabel: Record<string, string> = {
  EMERGENCIAL: "Emergencial",
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva (legado)",
};
const pendingReasons: Record<string, string> = {
  AGUARDANDO_PECA_MATERIAL: "Aguardando peça ou material",
  AGUARDANDO_TERCEIRIZADA: "Aguardando empresa terceirizada",
  AGUARDANDO_ORCAMENTO: "Aguardando orçamento",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  AGUARDANDO_PARADA_MAQUINA: "Aguardando parada do equipamento",
  AGUARDANDO_LIBERACAO_SETOR: "Aguardando liberação do setor",
  OUTRO: "Outro",
};
const priorityClass: Record<string, string> = {
  CRITICA: "border-l-red-600",
  ALTA: "border-l-orange-500",
  NORMAL: "border-l-blue-500",
  MEDIA: "border-l-blue-500",
  BAIXA: "border-l-emerald-500",
};
const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const orderCode = (order: any) => `OS-${String(order.number).padStart(6, "0")}`;
const executionLabel = (value: string) =>
  value === "TERCEIRIZADA" ? "Externa" : "Interna";
const maintenanceFeatures = {
  showAverageServiceTimeKpi: false,
  showCostKpi: false,
} as const;

const historyActionLabel: Record<string, string> = {
  CREATED: "Ordem criada manualmente",
  CREATED_FROM_CHECKLIST: "Ordem criada automaticamente pelo checklist",
  PREVENTIVE_GENERATED: "Ordem gerada pela manutenção preventiva",
  TRIAGED: "Triagem da manutenção realizada",
  ASSUMED: "Ordem assumida",
  STATUS_CHANGED: "Status alterado",
  PENDING_STARTED: "Pendência registrada",
  PENDING_ENDED: "Pendência encerrada",
  CONCLUDED: "Ordem concluída",
  REOPENED: "Ordem reaberta",
  UPDATED: "Informações da ordem atualizadas",
  KANBAN_REORDERED: "Ordem reposicionada no quadro",
  LEGACY_IMPORTED: "Histórico legado preservado",
};

const orderOriginLabel = (order: any) =>
  order.checklistExecutionId || order.checklistExecution
    ? "Checklist"
    : order.planId || order.plan
      ? "Manutenção preventiva"
      : "Manual";

function AttachmentGallery({ attachments }: { attachments: any[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const images = attachments.filter((item) => item.mimeType?.startsWith("image/"));
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attachments.map((attachment) => {
          const url = getUploadedFileUrl(attachment.path) ?? "#";
          const imageIndex = images.findIndex((item) => item.id === attachment.id);
          return attachment.mimeType?.startsWith("image/") ? (
            <button
              type="button"
              className="overflow-hidden rounded-xl border bg-slate-100 text-left"
              key={attachment.id}
              onClick={() => setActiveIndex(imageIndex)}
            >
              <img className="h-28 w-full object-cover" src={url} alt={attachment.filename} />
              <span className="block truncate px-2 pt-2 text-xs">{attachment.filename}</span>
              {attachment.origin && <span className="block px-2 pb-2 text-[11px] text-slate-500">Origem: {attachment.origin}</span>}
            </button>
          ) : (
            <a className="rounded-xl border p-3 text-sm font-semibold text-brand-700 underline" href={url} target="_blank" rel="noreferrer" key={attachment.id}>
              {attachment.filename}{attachment.origin ? ` · ${attachment.origin}` : ""}
            </a>
          );
        })}
      </div>
      {activeIndex !== null && images[activeIndex] && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/90 p-3" role="dialog" aria-modal="true" aria-label="Visualização ampliada do anexo">
          <button type="button" className="btn-secondary absolute right-3 top-3" onClick={() => setActiveIndex(null)}>Fechar</button>
          <button type="button" className="btn-secondary absolute left-3" disabled={images.length < 2} onClick={() => setActiveIndex((activeIndex - 1 + images.length) % images.length)} aria-label="Foto anterior">‹</button>
          <img className="max-h-[85vh] max-w-[88vw] object-contain" src={getUploadedFileUrl(images[activeIndex].path) ?? "#"} alt={images[activeIndex].filename} />
          <button type="button" className="btn-secondary absolute right-3" disabled={images.length < 2} onClick={() => setActiveIndex((activeIndex + 1) % images.length)} aria-label="Próxima foto">›</button>
          <p className="absolute bottom-3 rounded bg-black/60 px-3 py-1 text-sm text-white">{activeIndex + 1} de {images.length} · {images[activeIndex].filename}{images[activeIndex].origin ? ` · Origem: ${images[activeIndex].origin}` : ""}</p>
        </div>
      )}
    </>
  );
}

function OrderCard({
  order,
  onStatus,
  onOpen,
  canUpdate = false,
}: {
  order: any;
  onStatus: (order: any, status: string) => void;
  onOpen: () => void;
  canUpdate?: boolean;
}) {
  const overdue =
    order.status !== "CONCLUIDA" &&
    order.expectedAt &&
    new Date(order.expectedAt) < new Date();
  return (
    <article
      className={clsx(
        "rounded-xl border border-l-4 bg-white p-3 text-sm shadow-sm outline-none transition focus-within:ring-2 focus-within:ring-[#316b9d] motion-reduce:transition-none",
        priorityClass[order.priority],
      )}
    >
      <button type="button" data-kanban-open className="w-full rounded-lg text-left outline-none" onClick={onOpen} aria-label={`Abrir detalhes de ${orderCode(order)}`}>
        <div className="flex items-start justify-between gap-2">
          <strong>{orderCode(order)}</strong>
          <span
            className={clsx(
              "badge",
              overdue
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-700",
            )}
          >
            {overdue ? "Atrasada" : priorityLabel[order.priority]}
          </span>
        </div>
        <p className="mt-1 font-semibold text-slate-900">
          {order.equipment.name}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="badge-neutral">
            {executionLabel(order.executionType)}
          </span>
          <span className="badge-neutral">{typeLabel[order.type]}</span>
        </div>
        {order.status === "PENDENTE" && (
          <div className="mt-2">
            <span className="badge-warning">Pendência registrada</span>
            <p className="mt-1 text-xs text-amber-800">{pendingReasons[order.pendencies?.[0]?.reason] || order.pendencies?.[0]?.description || "Motivo registrado no histórico"}</p>
          </div>
        )}
        <div className="mt-2 grid gap-1 text-xs text-slate-500">
          <span>
            {order.executionType === "TERCEIRIZADA"
              ? `Empresa: ${order.supplier?.name || "Não definida"}`
              : `Responsável: ${order.assignees?.map((item: any) => item.employee.name).join(", ") || order.responsible?.name || "Não definido"}`}
          </span>
          <span>Prazo: {formatDate(order.expectedAt)}</span>
          <span>Abertura: {formatDate(order.openedAt)}</span>
          <span>Origem: {orderOriginLabel(order)}</span>
          {(order.attachments?.length ?? 0) > 0 && <span>📎 {order.attachments.length} anexo(s)</span>}
        </div>
      </button>
      {canUpdate && (
        <details className="relative mt-3 border-t border-slate-100 pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-2 font-semibold text-[#174d7a] outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-[#316b9d]">
            <span>Mover para</span><span aria-hidden="true">•••</span>
          </summary>
          <div className="absolute right-0 z-20 mt-1 grid min-w-48 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {allowedTargets(order.status).filter((status) => status !== order.status).map((status) => (
              <button key={status} type="button" className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#316b9d]" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onStatus(order, status); }}>
                {statusLabel[status]}
              </button>
            ))}
            {order.status === "CONCLUIDA" && <p className="px-3 py-2 text-xs text-slate-500">Use “Reabrir ordem” nos detalhes.</p>}
          </div>
        </details>
      )}
    </article>
  );
}

function Dashboard({
  data,
  onFilter,
  filters,
  onFilters,
  meta,
}: {
  data: any;
  onFilter: (
    status?: string,
    overdue?: boolean,
    executionType?: string,
  ) => void;
  filters: any;
  onFilters: (filters: any) => void;
  meta: any;
}) {
  const cards = data?.cards ?? {};
  const items = [
    ["Abertas", cards.open, "ABERTA"],
    ["Pendentes", cards.pending, "PENDENTE"],
    ["Em andamento", cards.inProgress, "EM_ANDAMENTO"],
    ["Concluídas no período", cards.concluded, "CONCLUIDA"],
    ["Atrasadas", cards.overdue, "OVERDUE"],
    ["Preventivas próximas", cards.preventiveDue, "PREVENTIVE"],
  ] as const;
  const charts = [
    ...(data?.charts?.byType ?? []),
    ...(data?.charts?.byPriority ?? []),
  ];
  const max = Math.max(1, ...charts.map((item: any) => item.value));
  const summaries = [
    ["Manutenção interna", "INTERNA", data?.execution?.internal],
    ["Empresa terceirizada", "TERCEIRIZADA", data?.execution?.outsourced],
  ] as const;
  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="section-title">Filtros do Dashboard</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid grid-cols-2 gap-2">
            <input
              aria-label="Dashboard período inicial"
              type="date"
              className="input"
              value={filters.from}
              onChange={(event) =>
                onFilters({ ...filters, from: event.target.value })
              }
            />
            <input
              aria-label="Dashboard período final"
              type="date"
              className="input"
              value={filters.to}
              onChange={(event) =>
                onFilters({ ...filters, to: event.target.value })
              }
            />
          </div>
          <select
            className="select"
            value={filters.status}
            onChange={(event) =>
              onFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="">Todos os status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.priority}
            onChange={(event) =>
              onFilters({ ...filters, priority: event.target.value })
            }
          >
            <option value="">Todas as prioridades</option>
            {["BAIXA", "NORMAL", "ALTA", "CRITICA"].map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel[priority]}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.type}
            onChange={(event) =>
              onFilters({ ...filters, type: event.target.value })
            }
          >
            <option value="">Todos os tipos</option>
            <option value="EMERGENCIAL">Emergencial</option>
            <option value="PREVENTIVA">Preventiva</option>
          </select>
          <select
            className="select"
            value={filters.executionType}
            onChange={(event) =>
              onFilters({ ...filters, executionType: event.target.value })
            }
          >
            <option value="">Todo tipo de atendimento</option>
            <option value="INTERNA">Manutenção interna</option>
            <option value="TERCEIRIZADA">Empresa terceirizada</option>
          </select>
          <select
            className="select"
            value={filters.equipmentId}
            onChange={(event) =>
              onFilters({ ...filters, equipmentId: event.target.value })
            }
          >
            <option value="">Todos os equipamentos</option>
            {meta.equipments.map((equipment: any) => (
              <option key={equipment.id} value={equipment.id}>
                {equipment.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.responsibleId}
            onChange={(event) =>
              onFilters({ ...filters, responsibleId: event.target.value })
            }
          >
            <option value="">Todos os responsáveis internos</option>
            {meta.maintenanceEmployees.map((employee: any) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.supplierId}
            onChange={(event) =>
              onFilters({ ...filters, supplierId: event.target.value })
            }
          >
            <option value="">Todas as empresas terceirizadas</option>
            {meta.suppliers.map((supplier: any) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {items.map(([label, value, filter]) => (
          <button
            key={label}
            className="card text-left transition hover:border-brand-400"
            onClick={() =>
              filter === "PREVENTIVE"
                ? undefined
                : onFilter(
                    filter === "OVERDUE" ? undefined : filter,
                    filter === "OVERDUE",
                  )
            }
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="kpi-value mt-1">{value ?? 0}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {summaries.map(([label, executionType, summary]) => (
          <section className="card" key={executionType}>
            <div className="flex items-center justify-between">
              <h2 className="section-title">{label}</h2>
              <button
                className="btn-secondary"
                onClick={() => onFilter(undefined, false, executionType)}
              >
                Ver ordens
              </button>
            </div>
            <button
              className="mt-4 text-left"
              onClick={() => onFilter(undefined, false, executionType)}
            >
              <span className="text-sm text-slate-500">Total no período</span>
              <strong className="block text-3xl">{summary?.total ?? 0}</strong>
            </button>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Abertas", "ABERTA", summary?.open],
                ["Pendentes", "PENDENTE", summary?.pending],
                ["Em andamento", "EM_ANDAMENTO", summary?.inProgress],
                ["Concluídas", "CONCLUIDA", summary?.concluded],
              ].map(([statusName, status, value]) => (
                <button
                  className="rounded-xl bg-slate-100 p-3 text-left"
                  key={statusName}
                  onClick={() => onFilter(String(status), false, executionType)}
                >
                  <span className="text-xs text-slate-500">{statusName}</span>
                  <strong className="block text-xl">{value ?? 0}</strong>
                </button>
              ))}
            </div>
            {(maintenanceFeatures.showCostKpi || maintenanceFeatures.showAverageServiceTimeKpi) && <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {maintenanceFeatures.showCostKpi && <div>
                <dt className="text-sm text-slate-500">Custo</dt>
                <dd className="text-xl font-bold">
                  {summary?.cost == null
                    ? "Restrito"
                    : Number(summary.cost).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                </dd>
              </div>}
              {maintenanceFeatures.showAverageServiceTimeKpi && <div>
                <dt className="text-sm text-slate-500">
                  Tempo médio de atendimento
                </dt>
                <dd className="text-xl font-bold">
                  {Number(summary?.averageCompletionHours ?? 0).toFixed(1)} h
                </dd>
              </div>}
            </dl>}
          </section>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Distribuição das ordens</h2>
          <div className="mt-4 space-y-3">
            {charts.map((item: any) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {typeLabel[item.label] ??
                      priorityLabel[item.label] ??
                      item.label}
                  </span>
                  <strong>{item.value}</strong>
                </div>
                <div className="h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-brand-600"
                    style={{ width: `${(item.value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        {(maintenanceFeatures.showAverageServiceTimeKpi || maintenanceFeatures.showCostKpi) && <section className="card">
          <h2 className="section-title">Desempenho no período</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {maintenanceFeatures.showAverageServiceTimeKpi && <>
            <div>
              <dt className="text-sm text-slate-500">Abertura até início</dt>
              <dd className="text-2xl font-bold">
                {Number(data?.averages?.startHours ?? 0).toFixed(1)} h
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Tempo de conclusão</dt>
              <dd className="text-2xl font-bold">
                {Number(data?.averages?.completionHours ?? 0).toFixed(1)} h
              </dd>
            </div>
            </>}
            {maintenanceFeatures.showCostKpi && <div>
              <dt className="text-sm text-slate-500">Custo no período</dt>
              <dd className="text-2xl font-bold">
                {data?.totalCost == null
                  ? "Restrito"
                  : Number(data.totalCost).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
              </dd>
            </div>}
          </dl>
        </section>}
      </div>
    </div>
  );
}

function OrderDetails({
  orderId,
  meta,
  onClose,
}: {
  orderId: string;
  meta: any;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const details = useQuery({
    queryKey: ["maintenance", orderId],
    queryFn: () => apiRequest<any>(`/maintenances/${orderId}`),
  });
  const [form, setForm] = useState<any>({
    executionType: "INTERNA",
    priority: "NORMAL",
    originalExecutionType: "INTERNA",
    executionTypeChangeReason: "",
    supplierId: "",
    assigneeIds: [],
    expectedAt: "",
    diagnosis: "",
    servicePerformed: "",
    workedHours: "",
    downtimeMinutes: "",
    internalCost: "",
    expectedExternalCost: "",
    approvedExternalCost: "",
    finalExternalCost: "",
    outsourcedContact: "",
    outsourcedPhone: "",
    outsourcedAttendant: "",
    outsourcedRequestedAt: "",
    outsourcedServiceAt: "",
    quoteNumber: "",
    invoiceNumber: "",
    notes: "",
    materials: [],
  });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  useEffect(() => {
    if (details.data)
      setForm({
        executionType: details.data.executionType,
        priority: details.data.priority,
        originalExecutionType: details.data.executionType,
        executionTypeChangeReason: "",
        supplierId: details.data.supplierId ?? "",
        assigneeIds: (details.data.assignees ?? []).map((item: any) => item.employeeId),
        expectedAt: details.data.expectedAt?.slice(0, 16) ?? "",
        diagnosis: details.data.diagnosis ?? details.data.cause ?? "",
        servicePerformed: details.data.servicePerformed ?? "",
        workedHours: details.data.workedHours ?? "",
        downtimeMinutes: details.data.downtimeMinutes ?? "",
        internalCost: details.data.internalCost ?? "",
        expectedExternalCost: details.data.expectedExternalCost ?? "",
        approvedExternalCost: details.data.approvedExternalCost ?? "",
        finalExternalCost: details.data.finalExternalCost ?? "",
        outsourcedContact: details.data.outsourcedContact ?? "",
        outsourcedPhone: details.data.outsourcedPhone ?? "",
        outsourcedAttendant: details.data.outsourcedAttendant ?? "",
        outsourcedRequestedAt:
          details.data.outsourcedRequestedAt?.slice(0, 16) ?? "",
        outsourcedServiceAt:
          details.data.outsourcedServiceAt?.slice(0, 16) ?? "",
        quoteNumber: details.data.quoteNumber ?? "",
        invoiceNumber: details.data.invoiceNumber ?? "",
        notes: details.data.notes ?? "",
        materials: (details.data.materials ?? []).map((item: any) => ({
          catalogItemId: item.catalogItemId ?? "",
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit ?? "",
          unitCost: item.unitCost == null ? "" : Number(item.unitCost),
        })),
      });
  }, [details.data]);
  const update = useMutation({
    mutationFn: async (payload: any) => {
      const attachmentIds = await Promise.all(
        attachmentFiles.map(async (file) => (await uploadFile(file)).id),
      );
      return apiRequest(`/maintenances/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...payload, attachmentIds }),
      });
    },
    onSuccess: () => {
      setAttachmentFiles([]);
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance", orderId] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-dashboard"] });
    },
  });
  const reopen = useMutation({
    mutationFn: (reason: string) =>
      apiRequest(`/maintenances/${orderId}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance", orderId] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-dashboard"] });
    },
  });
  const assume = useMutation({
    mutationFn: () =>
      apiRequest(`/maintenances/${orderId}/assume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance", orderId] });
    },
  });
  if (!details.data)
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40">
        <div className="card">Carregando ordem…</div>
      </div>
    );
  const order = details.data;
  const checklistProblemItems = order.checklistExecutionItem
    ? [order.checklistExecutionItem]
    : order.checklistExecution?.items?.filter((item: any) => item.hadProblem) ?? [];
  const checklistAttachments = checklistProblemItems.flatMap((item: any) => item.attachments ?? []);
  const detailAttachments = [
    ...(order.attachments ?? []).map((attachment: any) => ({ ...attachment, origin: "Ordem de manutenção" })),
    ...checklistAttachments.map((attachment: any) => ({ ...attachment, origin: "Checklist" })),
  ];
  const latestPending = order.pendencies?.[0];
  const canEdit =
    meta.permissions.manage ||
    (meta.permissions.updateInternal && order.executionType === "INTERNA");
  const canAssume =
    meta.permissions.updateInternal &&
    order.executionType === "INTERNA" &&
    meta.currentEmployeeId &&
    !(order.assignees ?? []).some(
      (item: any) => item.employeeId === meta.currentEmployeeId,
    );
  function save(event: FormEvent) {
    event.preventDefault();
    const payload: any = {
      diagnosis: form.diagnosis,
      servicePerformed: form.servicePerformed,
      notes: form.notes,
      workedHours: form.workedHours === "" ? null : Number(form.workedHours),
      downtimeMinutes:
        form.downtimeMinutes === "" ? null : Number(form.downtimeMinutes),
      materials: (form.materials ?? []).map((item: any) => ({
        ...item,
        catalogItemId: item.catalogItemId || null,
        quantity: Number(item.quantity),
        unitCost: item.unitCost === "" ? null : Number(item.unitCost),
      })),
    };
    if (meta.permissions.manage)
      Object.assign(payload, {
        priority: form.priority,
        executionType: form.executionType,
        executionTypeChangeReason:
          form.executionType !== form.originalExecutionType
            ? form.executionTypeChangeReason
            : undefined,
        supplierId:
          form.executionType === "TERCEIRIZADA"
            ? form.supplierId || null
            : null,
        assigneeIds: form.executionType === "INTERNA" ? form.assigneeIds : [],
        expectedAt: form.expectedAt || null,
        outsourcedContact: form.outsourcedContact,
        outsourcedPhone: form.outsourcedPhone,
        outsourcedAttendant: form.outsourcedAttendant,
        outsourcedRequestedAt: form.outsourcedRequestedAt || null,
        outsourcedServiceAt: form.outsourcedServiceAt || null,
        quoteNumber: form.quoteNumber,
        invoiceNumber: form.invoiceNumber,
        expectedExternalCost:
          form.expectedExternalCost === ""
            ? null
            : Number(form.expectedExternalCost),
        approvedExternalCost:
          form.approvedExternalCost === ""
            ? null
            : Number(form.approvedExternalCost),
        finalExternalCost:
          form.finalExternalCost === "" ? null : Number(form.finalExternalCost),
      });
    if (meta.permissions.viewCosts)
      payload.internalCost =
        form.internalCost === "" ? null : Number(form.internalCost);
    update.mutate(payload);
  }
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/50 p-2 sm:p-6">
      <div className="mx-auto max-w-5xl rounded-2xl bg-slate-50 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b bg-white p-4">
          <div>
            <h2 className="text-xl font-extrabold">
              {orderCode(order)} · {order.equipment.name}
            </h2>
            <p className="text-sm text-slate-500">
              {statusLabel[order.status]} · solicitada por{" "}
              {order.requesterNameSnapshot || "registro legado"}
            </p>
          </div>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr,.7fr]">
          <form className="card space-y-3" onSubmit={save}>
            <div className="flex items-center justify-between">
              <h3 className="section-title">{order.checklistExecution ? "Triagem da manutenção" : "Planejamento e execução"}</h3>
              <span className="badge-neutral">
                {executionLabel(order.executionType)}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Prioridade
                <select
                  disabled={!meta.permissions.manage}
                  className="select mt-1"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                >
                  <option value="BAIXA">Baixa</option>
                  <option value="NORMAL">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </label>
              <label className="text-sm">
                Tipo de atendimento
                <select
                  disabled={!meta.permissions.manage}
                  className="select mt-1"
                  value={form.executionType}
                  onChange={(e) => setForm({
                    ...form,
                    executionType: e.target.value,
                    supplierId: e.target.value === "INTERNA" ? "" : form.supplierId,
                    assigneeIds: e.target.value === "TERCEIRIZADA" ? [] : form.assigneeIds,
                  })}
                >
                  <option value="INTERNA">Manutenção interna</option>
                  <option value="TERCEIRIZADA">Manutenção externa</option>
                </select>
              </label>
              <label className="text-sm">
                Prazo previsto
                <input
                  disabled={!meta.permissions.manage}
                  type="datetime-local"
                  className="input mt-1"
                  value={form.expectedAt}
                  onChange={(e) =>
                    setForm({ ...form, expectedAt: e.target.value })
                  }
                />
              </label>
            </div>
            {form.executionType !== form.originalExecutionType && (
              <label className="block text-sm sm:col-span-2">
                Justificativa da alteração do tipo de atendimento
                <input
                  required
                  minLength={5}
                  className="input mt-1"
                  value={form.executionTypeChangeReason}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      executionTypeChangeReason: event.target.value,
                    })
                  }
                />
              </label>
            )}
            {form.executionType === "INTERNA" ? (
              <fieldset disabled={!meta.permissions.manage}>
                <legend className="text-sm font-semibold">Responsáveis</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {meta.maintenanceEmployees.map((employee: any) => (
                    <label
                      key={employee.id}
                      className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3"
                    >
                      <input
                        type="checkbox"
                        checked={form.assigneeIds?.includes(employee.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            assigneeIds: e.target.checked
                              ? [...(form.assigneeIds ?? []), employee.id]
                              : form.assigneeIds.filter(
                                  (value: string) => value !== employee.id,
                                ),
                          })
                        }
                      />
                      {employee.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <fieldset disabled={!meta.permissions.manage} className="contents">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Empresa / CNPJ
                  <select
                    className="select mt-1"
                    value={form.supplierId}
                    onChange={(e) =>
                      setForm({ ...form, supplierId: e.target.value })
                    }
                  >
                    <option value="">Selecione</option>
                    {meta.suppliers.map((supplier: any) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}{" "}
                        {supplier.document ? `· ${supplier.document}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Contato
                  <input
                    className="input mt-1"
                    value={form.outsourcedContact}
                    onChange={(e) =>
                      setForm({ ...form, outsourcedContact: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Telefone
                  <input
                    className="input mt-1"
                    value={form.outsourcedPhone}
                    onChange={(e) =>
                      setForm({ ...form, outsourcedPhone: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Responsável pelo atendimento
                  <input
                    className="input mt-1"
                    value={form.outsourcedAttendant}
                    onChange={(e) =>
                      setForm({ ...form, outsourcedAttendant: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Data da solicitação
                  <input
                    type="datetime-local"
                    className="input mt-1"
                    value={form.outsourcedRequestedAt}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        outsourcedRequestedAt: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Número do orçamento
                  <input
                    className="input mt-1"
                    value={form.quoteNumber}
                    onChange={(e) =>
                      setForm({ ...form, quoteNumber: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Valor previsto
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1"
                    value={form.expectedExternalCost}
                    onChange={(e) =>
                      setForm({ ...form, expectedExternalCost: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Valor aprovado
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1"
                    value={form.approvedExternalCost}
                    onChange={(e) =>
                      setForm({ ...form, approvedExternalCost: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Valor final
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1"
                    value={form.finalExternalCost}
                    onChange={(e) =>
                      setForm({ ...form, finalExternalCost: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Data efetiva do atendimento
                  <input
                    type="datetime-local"
                    className="input mt-1"
                    value={form.outsourcedServiceAt}
                    onChange={(e) =>
                      setForm({ ...form, outsourcedServiceAt: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Nota fiscal ou documento
                  <input
                    className="input mt-1"
                    value={form.invoiceNumber}
                    onChange={(e) =>
                      setForm({ ...form, invoiceNumber: e.target.value })
                    }
                  />
                </label>
              </div>
              </fieldset>
            )}
            <label className="block text-sm">
              {order.checklistExecution ? "Descrição do problema" : "Diagnóstico ou causa"}
              <textarea
                className="textarea mt-1"
                value={form.diagnosis}
                onChange={(e) =>
                  setForm({ ...form, diagnosis: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Serviço executado
              <textarea
                className="textarea mt-1"
                value={form.servicePerformed}
                onChange={(e) =>
                  setForm({ ...form, servicePerformed: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Observação complementar
              <textarea
                className="textarea mt-1"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Complementa a solicitação sem alterar a irregularidade original"
              />
            </label>
            <fieldset className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <legend className="font-semibold">Materiais e peças</legend>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      materials: [
                        ...form.materials,
                        {
                          catalogItemId: "",
                          description: "",
                          quantity: 1,
                          unit: "UN",
                          unitCost: "",
                        },
                      ],
                    })
                  }
                >
                  + Material
                </button>
              </div>
              <div className="mt-2 space-y-2">
                  {(form.materials ?? []).map((material: any, index: number) => (
                  <div
                    className="grid gap-2 sm:grid-cols-[1fr,90px,110px,44px]"
                    key={index}
                  >
                    <select
                      className="select"
                      value={material.catalogItemId}
                      onChange={(e) => {
                        const catalog = meta.materials.find(
                          (item: any) => item.id === e.target.value,
                        );
                        const materials = [...form.materials];
                        materials[index] = {
                          ...material,
                          catalogItemId: e.target.value,
                          description:
                            catalog?.name ||
                            catalog?.description ||
                            material.description,
                          unit: catalog?.unit || material.unit,
                          unitCost:
                            catalog?.industrialConfig?.currentUnitCost ??
                            material.unitCost,
                        };
                        setForm({ ...form, materials });
                      }}
                    >
                      <option value="">Item livre</option>
                      {meta.materials.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name || item.description}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Quantidade"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      className="input"
                      value={material.quantity}
                      onChange={(e) => {
                        const materials = [...form.materials];
                        materials[index] = {
                          ...material,
                          quantity: e.target.value,
                        };
                        setForm({ ...form, materials });
                      }}
                    />
                    <input
                      aria-label="Custo unitário"
                      type="number"
                      min="0"
                      step="0.01"
                      className="input"
                      value={material.unitCost}
                      onChange={(e) => {
                        const materials = [...form.materials];
                        materials[index] = {
                          ...material,
                          unitCost: e.target.value,
                        };
                        setForm({ ...form, materials });
                      }}
                    />
                    <button
                      aria-label="Remover material"
                      type="button"
                      className="btn-danger px-2"
                      onClick={() =>
                        setForm({
                          ...form,
                          materials: form.materials.filter(
                            (_: any, itemIndex: number) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                    {!material.catalogItemId && (
                      <input
                        required
                        className="input sm:col-span-4"
                        placeholder="Descrição do material"
                        value={material.description}
                        onChange={(e) => {
                          const materials = [...form.materials];
                          materials[index] = {
                            ...material,
                            description: e.target.value,
                          };
                          setForm({ ...form, materials });
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                O vínculo com o estoque é informativo; não há baixa automática
                nesta implantação.
              </p>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Horas trabalhadas
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  className="input mt-1"
                  value={form.workedHours}
                  onChange={(e) =>
                    setForm({ ...form, workedHours: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Parada (min)
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={form.downtimeMinutes}
                  onChange={(e) =>
                    setForm({ ...form, downtimeMinutes: e.target.value })
                  }
                />
              </label>
              {meta.permissions.viewCosts && (
                <label className="text-sm">
                  Custo interno
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1"
                    value={form.internalCost}
                    onChange={(e) =>
                      setForm({ ...form, internalCost: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
            {canEdit && (
              <>
                <label className="block text-sm font-semibold">
                  Fotos e anexos adicionais
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="input mt-1"
                    onChange={(event) =>
                      setAttachmentFiles(Array.from(event.target.files ?? []))
                    }
                  />
                </label>
                <button
                  className="btn-primary w-full"
                  disabled={update.isPending}
                >
                  {update.isPending ? "Salvando…" : "Salvar detalhamento"}
                </button>
              </>
            )}
            {order.status === "CONCLUIDA" && meta.permissions.reopen && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  const reason = window.prompt("Justificativa da reabertura:");
                  if (reason && reason.length >= 5) reopen.mutate(reason);
                }}
              >
                Reabrir ordem
              </button>
            )}
            {update.error && (
              <p className="text-sm text-red-600">
                {(update.error as Error).message}
              </p>
            )}
          </form>
          <aside className="space-y-4">
            <section className="card">
              <h3 className="section-title">Solicitação</h3>
              {canAssume && (
                <button
                  type="button"
                  className="btn-primary mt-3 w-full"
                  disabled={assume.isPending}
                  onClick={() => assume.mutate()}
                >
                  {assume.isPending ? "Assumindo…" : "Assumir ordem"}
                </button>
              )}
              {assume.error && (
                <p className="mt-2 text-sm text-red-600">
                  {(assume.error as Error).message}
                </p>
              )}
              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                <div>Número: {orderCode(order)}</div>
                <div>Equipamento: {order.equipment.name}</div>
                <div>Status atual: {statusLabel[order.status]}</div>
                <div>Tipo da manutenção: {typeLabel[order.type]}</div>
                <div>Origem da ordem: {orderOriginLabel(order)}</div>
                <div>
                  Tipo de atendimento:{" "}
                  <span className="badge-neutral">
                    {executionLabel(order.executionType)}
                  </span>
                </div>
                <div>Prioridade: {priorityLabel[order.priority]}</div>
                <div>Quem abriu a ordem: {order.requestedBy?.employee?.name || order.requesterNameSnapshot || order.requestedBy?.email || "Sistema"}</div>
                {order.checklistExecution && <div>Quem preencheu o checklist: {order.checklistExecution.employee?.name || "—"}</div>}
                <div>Abertura: {formatDate(order.openedAt)}</div>
                <div>Conclusão: {formatDate(order.concludedAt)}</div>
                <div>Setor: {order.requesterDepartmentSnapshot || "—"}</div>
                <div>
                  Local:{" "}
                  {order.equipmentLocationSnapshot ||
                    order.equipment.department}
                </div>
              </dl>
              <div className="mt-3 space-y-3 text-sm">
                <div><strong>Descrição original do defeito ou irregularidade</strong><p>{order.description}</p></div>
                <div><strong>Descrição complementar do problema</strong><p>{order.diagnosis || order.cause || "Não informada"}</p></div>
                <div><strong>Observações complementares</strong><p>{order.notes || order.finalNotes || "Não informadas"}</p></div>
                {latestPending && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><strong>Motivo mais recente da pendência</strong><p>{pendingReasons[latestPending.reason] || latestPending.reason}{latestPending.description ? ` — ${latestPending.description}` : ""}</p><p className="text-slate-500">{formatDate(latestPending.startedAt)} · {latestPending.actorUser?.employee?.name || latestPending.actorUser?.email || "Sistema"}</p></div>}
              </div>
              {order.checklistExecution && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
                  <strong>Origem: checklist</strong>
                  <p>{order.checklistExecution.template?.name || "Checklist"}</p>
                  <p>Realizado por {order.checklistExecution.employee?.name || order.requesterNameSnapshot || "—"} em {formatDate(order.checklistExecution.executedAt)}</p>
                  {checklistProblemItems.map((item: any) => (
                    <div className="mt-2" key={item.id}>
                      <strong>{item.templateItem?.label}</strong>
                      <p>{item.observation || "Irregularidade registrada sem observação."}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold">Fotos e demais anexos</p>
                {detailAttachments.length > 0 ? <AttachmentGallery attachments={detailAttachments} /> : <p className="text-sm text-slate-500">Nenhuma foto anexada</p>}
              </div>
            </section>
            {order.pendencies?.length > 0 && (
              <section className="card">
                <h3 className="section-title">Pendências</h3>
                <div className="mt-3 space-y-3">
                  {order.pendencies.map((pending: any) => (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" key={pending.id}>
                      <strong>{pendingReasons[pending.reason] || pending.reason}</strong>
                      {pending.description && <p>{pending.description}</p>}
                      <p className="text-slate-500">{formatDate(pending.startedAt)} · {pending.actorUser?.employee?.name || pending.actorUser?.email || "Sistema"}{pending.endedAt ? ` · encerrada em ${formatDate(pending.endedAt)}` : " · ativa"}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="card">
              <h3 className="section-title">Histórico de movimentações</h3>
              <div className="mt-3 space-y-3">
                {order.history.map((event: any) => (
                  <div
                    className="border-l-2 border-slate-300 pl-3 text-sm"
                    key={event.id}
                  >
                    <strong>{historyActionLabel[event.action] || event.action}</strong>
                    <p className="text-slate-500">
                      {formatDate(event.createdAt)} ·{" "}
                      {event.actorUser?.employee?.name ||
                        event.actorUser?.email ||
                        "Sistema"}
                    </p>
                    {event.fromStatus !== event.toStatus && <p>{event.fromStatus ? statusLabel[event.fromStatus] : "Sem status anterior"} → {event.toStatus ? statusLabel[event.toStatus] : "—"}</p>}
                    {event.details?.pending?.reason && <p>Motivo: {pendingReasons[event.details.pending.reason] || event.details.pending.reason}{event.details.pending.description ? ` — ${event.details.pending.description}` : ""}</p>}
                    {event.details?.reason && <p>{event.details.reason}</p>}
                    {event.details?.changedFields?.map((change: any, index: number) => <p key={`${event.id}-${index}`} className="text-slate-600">{change.field}: {Array.isArray(change.previous) ? change.previous.join(", ") : String(change.previous ?? "—")} → {Array.isArray(change.next) ? change.next.join(", ") : String(change.next ?? "—")}</p>)}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function EquipmentDetails({ equipment, onClose }: { equipment: any; onClose: () => void }) {
  const [filters, setFilters] = useState({ mode: "all", date: "", from: "", to: "", type: "", status: "", executionType: "" });
  const queryParams = new URLSearchParams();
  if (filters.mode === "date" && filters.date) {
    queryParams.set("from", filters.date);
    queryParams.set("to", filters.date);
  }
  if (filters.mode === "range") {
    if (filters.from) queryParams.set("from", filters.from);
    if (filters.to) queryParams.set("to", filters.to);
  }
  if (filters.type) queryParams.set("type", filters.type);
  if (filters.status) queryParams.set("status", filters.status);
  if (filters.executionType) queryParams.set("executionType", filters.executionType);
  const history = useQuery({
    queryKey: ["equipment-maintenance-history", equipment.id, filters],
    queryFn: () => apiRequest<any>(`/history/equipment/${equipment.id}?${queryParams}`),
  });
  const data = history.data;
  const periodLabel = filters.mode === "date" && filters.date
    ? new Date(`${filters.date}T12:00:00`).toLocaleDateString("pt-BR")
    : filters.mode === "range"
      ? `${filters.from ? new Date(`${filters.from}T12:00:00`).toLocaleDateString("pt-BR") : "início"} a ${filters.to ? new Date(`${filters.to}T12:00:00`).toLocaleDateString("pt-BR") : "hoje"}`
      : "Histórico completo";
  const reportImages = (data?.maintenances ?? []).flatMap((order: any) => order.attachments ?? []).filter((item: any) => item.mimeType?.startsWith("image/"));
  return (
    <div className="maintenance-report-overlay fixed inset-0 z-40 overflow-y-auto bg-slate-950/50 p-2 sm:p-6">
      <div className="maintenance-print-report mx-auto max-w-6xl rounded-2xl bg-slate-50 shadow-2xl">
        <header className="print-hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b bg-white p-4">
          <div><h2 className="text-xl font-extrabold">Histórico · {equipment.name}</h2><p className="text-sm text-slate-500">Relatório exclusivo do equipamento selecionado</p></div>
          <div className="flex gap-2"><button type="button" className="btn-primary" onClick={() => window.print()}>Imprimir relatório</button><button type="button" className="btn-secondary" onClick={onClose}>Fechar</button></div>
        </header>
        <div className="p-4 sm:p-6">
          <section className="print-only mb-5 hidden border-b pb-4">
            <h1 className="text-2xl font-extrabold">Relatório de manutenção do equipamento</h1>
            <p>{data?.company?.tradeName || data?.company?.legalName || "SmartCheck"} · CNPJ {data?.company?.cnpj || "—"}</p>
          </section>
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-2xl font-extrabold">{equipment.name}</h3><p className="text-slate-500">{equipment.assetTag || equipment.serialNumber || equipment.id}</p></div>
              <span className={equipment.isActive ? "badge-success" : "badge-neutral"}>{equipment.isActive ? "Ativo" : "Inativo"}</span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-slate-500">Código / identificação</dt><dd>{equipment.assetTag || equipment.serialNumber || "—"}</dd></div>
              <div><dt className="text-slate-500">Categoria</dt><dd>{equipment.type || "—"}</dd></div>
              <div><dt className="text-slate-500">Setor / local</dt><dd>{equipment.department || "—"}</dd></div>
              <div><dt className="text-slate-500">Situação atual</dt><dd>{data?.maintenances?.[0] ? statusLabel[data.maintenances[0].status] : "Sem ordem no período"}</dd></div>
              <div><dt className="text-slate-500">Fabricante / modelo</dt><dd>{[equipment.manufacturer, equipment.model].filter(Boolean).join(" · ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Período consultado</dt><dd>{periodLabel}</dd></div>
              <div><dt className="text-slate-500">Preventivas</dt><dd>{data?.maintenances?.filter((item: any) => item.type === "PREVENTIVA").length ?? 0}</dd></div>
              <div><dt className="text-slate-500">Corretivas / emergenciais</dt><dd>{data?.maintenances?.filter((item: any) => item.type !== "PREVENTIVA").length ?? 0}</dd></div>
            </dl>
          </section>
          <section className="card print-hidden mt-4">
            <h3 className="section-title">Filtros do histórico</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select className="select" value={filters.mode} onChange={(event) => setFilters({ ...filters, mode: event.target.value })}><option value="all">Histórico completo</option><option value="date">Data específica</option><option value="range">Período</option></select>
              {filters.mode === "date" && <input aria-label="Data específica" type="date" className="input" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />}
              {filters.mode === "range" && <div className="grid grid-cols-2 gap-2"><input aria-label="Data inicial do equipamento" type="date" className="input" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /><input aria-label="Data final do equipamento" type="date" className="input" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></div>}
              <select className="select" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Todos os tipos</option><option value="PREVENTIVA">Preventiva</option><option value="CORRETIVA">Corretiva</option><option value="EMERGENCIAL">Emergencial</option></select>
              <select className="select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos os status</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select>
              <select className="select" value={filters.executionType} onChange={(event) => setFilters({ ...filters, executionType: event.target.value })}><option value="">Interna e externa</option><option value="INTERNA">Interna</option><option value="TERCEIRIZADA">Externa</option></select>
            </div>
          </section>
          {history.isLoading && <section className="card mt-4">Carregando histórico…</section>}
          {history.error && <section className="card mt-4 text-red-600">{(history.error as Error).message}</section>}
          {data && <>
            <section className="mt-4 space-y-3">
              <h3 className="section-title">Ordens de serviço e manutenções</h3>
              {data.maintenances.map((order: any) => (
                <article className="card break-inside-avoid" key={order.id}>
                  <div className="flex flex-wrap justify-between gap-2"><strong>{orderCode(order)} · {typeLabel[order.type]}</strong><span className="badge-neutral">{statusLabel[order.status]}</span></div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div><dt className="text-slate-500">Abertura / conclusão</dt><dd>{formatDate(order.openedAt)} / {formatDate(order.concludedAt)}</dd></div>
                    <div><dt className="text-slate-500">Atendimento</dt><dd>{executionLabel(order.executionType)}</dd></div>
                    <div><dt className="text-slate-500">Responsáveis</dt><dd>{order.executionType === "TERCEIRIZADA" ? order.supplier?.name || "—" : order.assignees?.map((item: any) => item.employee.name).join(", ") || "—"}</dd></div>
                    <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-500">Problema / irregularidade original</dt><dd>{order.description}</dd></div>
                    <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-500">Diagnóstico</dt><dd>{order.diagnosis || order.cause || "—"}</dd></div>
                    <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-500">Serviço executado</dt><dd>{order.servicePerformed || "—"}</dd></div>
                    <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-500">Observações</dt><dd>{order.notes || order.finalNotes || "—"}</dd></div>
                  </dl>
                  {order.pendencies?.length > 0 && <div className="mt-3 text-sm"><strong>Pendências:</strong>{order.pendencies.map((pending: any) => <p key={pending.id}>{formatDate(pending.startedAt)} · {pendingReasons[pending.reason] || pending.reason}{pending.description ? ` — ${pending.description}` : ""}</p>)}</div>}
                  {order.materials?.length > 0 && <div className="mt-3 text-sm"><strong>Peças e materiais:</strong>{order.materials.map((material: any) => <p key={material.id}>{material.description} · {Number(material.quantity)} {material.unit || ""}{material.totalCost != null ? ` · ${Number(material.totalCost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</p>)}</div>}
                  {order.attachments?.length > 0 && <div className="print-hidden mt-3"><AttachmentGallery attachments={order.attachments} /></div>}
                </article>
              ))}
              {data.maintenances.length === 0 && <p className="card text-sm text-slate-500">Nenhuma manutenção encontrada para os filtros aplicados.</p>}
            </section>
            <section className="mt-4 space-y-3"><h3 className="section-title">Planos preventivos</h3>{data.plans.map((plan: any) => <article className="card break-inside-avoid" key={plan.id}><strong>{plan.title}</strong><p className="text-sm">{plan.description || "Sem descrição"} · {plan.frequency || plan.triggerType} · {plan.isActive ? "Ativo" : "Inativo"}</p></article>)}{data.plans.length === 0 && <p className="card text-sm text-slate-500">Nenhum plano preventivo vinculado.</p>}</section>
            {reportImages.length > 0 && <section className="mt-4 break-before-page"><h3 className="section-title">Fotos</h3><div className="mt-3 grid grid-cols-2 gap-3">{reportImages.map((image: any) => <figure className="break-inside-avoid" key={image.id}><img className="max-h-64 w-full object-contain" src={getUploadedFileUrl(image.path) ?? "#"} alt={image.filename} /><figcaption className="text-xs">{image.filename}</figcaption></figure>)}</div></section>}
            <footer className="mt-6 border-t pt-3 text-xs text-slate-500">Emitido em {formatDate(data.emittedAt)} · Período: {periodLabel}</footer>
          </>}
        </div>
      </div>
    </div>
  );
}

export function MaintenancePage({ operational = false }: { operational?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [area, setArea] = useState<(typeof areas)[number][0]>("orders");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{ order: any; reason: string; description: string; targetPosition?: number } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    type: "",
    priority: "",
    equipmentId: "",
    responsibleId: "",
    requestedById: "",
    supplierId: "",
    executionType: "",
    from: "",
    to: "",
  });
  const [dashboardFilters, setDashboardFilters] = useState({
    status: "",
    type: "",
    priority: "",
    equipmentId: "",
    responsibleId: "",
    supplierId: "",
    executionType: "",
    from: "",
    to: "",
  });
  const [quick, setQuick] = useState({
    equipmentId: "",
    type: "EMERGENCIAL",
    executionType: "",
    responsibleId: "",
    supplierId: "",
    priority: "CRITICA",
    description: "",
    notes: "",
    file: null as File | null,
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    document: "",
    contactName: "",
    phone: "",
  });
  const [plan, setPlan] = useState({
    equipmentId: "",
    title: "",
    description: "",
    frequency: "MENSAL",
    customIntervalDays: "",
    startDate: new Date().toISOString().slice(0, 10),
    defaultResponsibleId: "",
    executionType: "INTERNA",
    priority: "NORMAL",
    executionDeadlineDays: "1",
    checklistInstructions: "",
  });
  const metaQuery = useQuery({
    queryKey: ["maintenance-meta"],
    queryFn: () => apiRequest<any>("/maintenance/meta"),
  });
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
  const dashboardParams = new URLSearchParams(
    Object.entries(dashboardFilters).filter(([, value]) => value),
  );
  const ordersQuery = useQuery({
    queryKey: ["maintenances", filters],
    queryFn: () => apiRequest<any[]>(`/maintenances?${params}`),
  });
  const dashboardQuery = useQuery({
    queryKey: ["maintenance-dashboard", dashboardFilters],
    queryFn: () =>
      apiRequest<any>(`/maintenances/dashboard?${dashboardParams}`),
    enabled: !operational && Boolean(metaQuery.data?.permissions?.viewDashboard),
  });
  const plansQuery = useQuery({
    queryKey: ["maintenance-plans"],
    queryFn: () => apiRequest<any[]>("/maintenance-plans"),
    enabled: !operational,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["maintenances"] });
    queryClient.invalidateQueries({ queryKey: ["maintenance-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["maintenance-plans"] });
  };
  const create = useMutation({
    mutationFn: async () => {
      const attachmentIds = quick.file
        ? [(await uploadFile(quick.file)).id]
        : [];
      return apiRequest<any>("/maintenances", {
        method: "POST",
        body: JSON.stringify({
          equipmentId: quick.equipmentId,
          type: quick.type,
          executionType: quick.executionType,
          responsibleId: quick.responsibleId || null,
          supplierId: quick.supplierId || null,
          priority: quick.priority,
          description: quick.description,
          notes: quick.notes || null,
          attachmentIds,
        }),
      });
    },
    onSuccess: (order) => {
      setConfirmation(orderCode(order));
      setQuick((current) => ({
        ...current,
        equipmentId: "",
        executionType: "",
        responsibleId: "",
        supplierId: "",
        description: "",
        notes: "",
        file: null,
      }));
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, data }: any) =>
      apiRequest(`/maintenances/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setPendingTransition(null);
      invalidate();
    },
  });
  const move = useMutation({
    mutationFn: ({ order, targetStatus, targetPosition, pending, servicePerformed }: any) =>
      apiRequest<any>(`/maintenances/${order.id}/move`, {
        method: "POST",
        body: JSON.stringify({
          sourceStatus: order.status,
          targetStatus,
          targetPosition,
          expectedVersion: order.lockVersion ?? 0,
          pending,
          servicePerformed,
        }),
      }),
    onMutate: async ({ order, targetStatus, targetPosition }: any) => {
      const queryKey = ["maintenances", filters] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (current = []) =>
        moveOrderInCache(current, order.id, targetStatus, targetPosition)
          .filter((item) => !filters.status || item.status === filters.status),
      );
      setMoveFeedback(null);
      return { previous, queryKey };
    },
    onSuccess: (updated, _variables, context) => {
      if (context?.queryKey) queryClient.setQueryData<any[]>(context.queryKey, (current = []) =>
        current.map((item) => item.id === updated.id ? updated : item),
      );
      setPendingTransition(null);
      setMoveFeedback({ type: "success", message: `${orderCode(updated)} movida para ${statusLabel[updated.status]}.` });
      queryClient.invalidateQueries({ queryKey: ["maintenance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance", updated.id] });
    },
    onError: (error, _variables, context) => {
      if (context?.previous && context.queryKey) queryClient.setQueryData(context.queryKey, context.previous);
      setMoveFeedback({ type: "error", message: `${(error as Error).message} A ordem voltou à posição anterior.` });
    },
  });
  const createPlan = useMutation({
    mutationFn: () =>
      apiRequest("/maintenance-plans", {
        method: "POST",
        body: JSON.stringify({
          ...plan,
          customIntervalDays: plan.customIntervalDays
            ? Number(plan.customIntervalDays)
            : null,
          defaultResponsibleId: plan.defaultResponsibleId || null,
          executionDeadlineDays: Number(plan.executionDeadlineDays),
          startDate: `${plan.startDate}T12:00:00.000Z`,
        }),
      }),
    onSuccess: () => {
      setPlan((current) => ({
        ...current,
        title: "",
        description: "",
        checklistInstructions: "",
      }));
      invalidate();
    },
  });
  const createSupplier = useMutation({
    mutationFn: () =>
      apiRequest("/maintenance/suppliers", {
        method: "POST",
        body: JSON.stringify(supplierForm),
      }),
    onSuccess: () => {
      setSupplierForm({ name: "", document: "", contactName: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["maintenance-meta"] });
    },
  });
  const meta = metaQuery.data ?? {
    equipments: [],
    maintenanceEmployees: [],
    suppliers: [],
    materials: [],
    permissions: {},
  };
  const equipmentOptions = meta.equipments.map((equipment: any) => ({
    value: equipment.id,
    label: equipment.name,
  }));
  const orders = useMemo(
    () =>
      (ordersQuery.data ?? [])
        .filter(
          (order) =>
            !overdueOnly ||
            (order.status !== "CONCLUIDA" &&
              order.expectedAt &&
              new Date(order.expectedAt) < new Date()),
        )
        .filter(
          (order) =>
            area !== "outsourced" || order.executionType === "TERCEIRIZADA",
        ),
    [ordersQuery.data, overdueOnly, area],
  );

  function changeStatus(order: any, status: string, targetPosition?: number) {
    if (status === order.status && targetPosition === undefined) return;
    let servicePerformed: string | undefined;
    if (status === "PENDENTE") {
      setPendingTransition({ order, reason: "", description: "", targetPosition });
      return;
    }
    if (status === "CONCLUIDA") {
      servicePerformed =
        window.prompt("Descreva o serviço executado para concluir:") ||
        undefined;
      if (!servicePerformed) return;
    }
    move.mutate({
      order,
      targetStatus: status,
      targetPosition: targetPosition ?? orders.filter((item) => item.status === status).length,
      servicePerformed,
    });
  }
  function openFiltered(
    status?: string,
    overdue = false,
    executionType?: string,
  ) {
    setFilters((current) => ({
      ...current,
      ...dashboardFilters,
      status: status ?? dashboardFilters.status,
      executionType: executionType ?? dashboardFilters.executionType,
    }));
    setOverdueOnly(overdue);
    setArea("history");
  }
  function submitQuick(event: FormEvent) {
    event.preventDefault();
    if (!quick.executionType) return;
    if (!quick.equipmentId) {
      const trigger = event.currentTarget.querySelector<HTMLButtonElement>(
        "#maintenance-equipment-selector-trigger",
      );
      trigger?.focus();
      trigger?.click();
      return;
    }
    create.mutate();
  }
  function submitPlan(event: FormEvent) {
    event.preventDefault();
    createPlan.mutate();
  }
  function exportOrders() {
    const columns = [
      "Ordem",
      "Equipamento",
      "Tipo",
      "Origem",
      "Prioridade",
      "Status",
      "Abertura",
      "Prazo",
      "Execução",
      "Responsáveis",
      "Descrição complementar",
      "Observações",
      "Motivo da pendência",
    ];
    const rows = orders.map((order) => [
      orderCode(order),
      order.equipment.name,
      typeLabel[order.type],
      orderOriginLabel(order),
      priorityLabel[order.priority],
      statusLabel[order.status],
      formatDate(order.openedAt),
      formatDate(order.expectedAt),
      order.executionType,
      order.assignees?.map((item: any) => item.employee.name).join("; "),
      order.diagnosis || order.cause || "",
      order.notes || order.finalNotes || "",
      order.pendencies?.[0] ? `${pendingReasons[order.pendencies[0].reason] || order.pendencies[0].reason}${order.pendencies[0].description ? ` — ${order.pendencies[0].description}` : ""}` : "",
    ]);
    const csv = [columns, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `ordens-manutencao-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="space-y-4">
      <header className="card overflow-hidden !bg-slate-950 !text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
              {operational ? "Operação Arcovan" : "Gestão de manutenção"}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold">
              {operational ? "Ordens de manutenção" : "Ordens, preventivas e histórico dos equipamentos"}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Fluxo único para solicitação, planejamento, execução e
              rastreabilidade.
            </p>
          </div>
        </div>
        {!operational ? <nav
          className="mt-5 flex gap-2 overflow-x-auto pb-1"
          aria-label="Áreas da manutenção"
        >
          {areas
            .filter(
              ([key]) => key !== "dashboard" || meta.permissions.viewDashboard,
            )
            .map(([key, label]) => (
              <button
                key={key}
                className={clsx(
                  "min-h-11 whitespace-nowrap rounded-xl px-4 text-sm font-semibold",
                  area === key
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-slate-800 text-slate-100",
                )}
                onClick={() => setArea(key)}
              >
                {label}
              </button>
            ))}
        </nav> : null}
      </header>

      {area === "dashboard" && (
        <Dashboard
          data={dashboardQuery.data}
          onFilter={openFiltered}
          filters={dashboardFilters}
          onFilters={setDashboardFilters}
          meta={meta}
        />
      )}

      {area === "orders" && (
        <>
          {confirmation && (
            <div className="rounded-xl bg-emerald-100 p-4 font-semibold text-emerald-800">
              Solicitação aberta com sucesso: {confirmation}
            </div>
          )}
          <form id="quick-order" className="card" onSubmit={submitQuick}>
            <div className="mb-4">
              <h2 className="section-title">Abertura rápida</h2>
              <p className="text-sm text-slate-500">
                Os dados do solicitante, setor, local, horário e número são
                preenchidos automaticamente.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="min-w-0 lg:col-span-2">
                <SearchableSelect
                  id="maintenance-equipment-selector"
                  label="Selecione o equipamento"
                  value={quick.equipmentId}
                  options={equipmentOptions}
                  onChange={(equipmentId) =>
                    setQuick({ ...quick, equipmentId })
                  }
                  placeholder="Selecione o equipamento"
                  clearLabel="Limpar seleção"
                  required
                  loading={metaQuery.isLoading}
                  errorMessage={metaQuery.isError ? (metaQuery.error as Error).message : undefined}
                />
              </div>
              <fieldset className="lg:col-span-2">
                <legend className="text-sm font-semibold">
                  Tipo de atendimento
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label
                    className={clsx(
                      "flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3",
                      quick.executionType === "INTERNA"
                        ? "border-brand-600 bg-brand-50"
                        : "border-slate-200",
                    )}
                  >
                    <input
                      required
                      type="radio"
                      name="executionType"
                      value="INTERNA"
                      checked={quick.executionType === "INTERNA"}
                      onChange={(event) =>
                        setQuick({
                          ...quick,
                          executionType: event.target.value,
                          supplierId: "",
                        })
                      }
                    />
                    <span>
                      <strong className="block">Manutenção interna</strong>
                      <small>Equipe de manutenção</small>
                    </span>
                  </label>
                  <label
                    className={clsx(
                      "flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3",
                      quick.executionType === "TERCEIRIZADA"
                        ? "border-brand-600 bg-brand-50"
                        : "border-slate-200",
                    )}
                  >
                    <input
                      required
                      type="radio"
                      name="executionType"
                      value="TERCEIRIZADA"
                      checked={quick.executionType === "TERCEIRIZADA"}
                      onChange={(event) =>
                        setQuick({
                          ...quick,
                          executionType: event.target.value,
                          responsibleId: "",
                        })
                      }
                    />
                    <span>
                      <strong className="block">Empresa terceirizada</strong>
                      <small>Prestador externo</small>
                    </span>
                  </label>
                </div>
              </fieldset>
              {meta.permissions.manage && quick.executionType === "INTERNA" && (
                <div className="min-w-0 lg:col-span-2">
                  <SearchableSelect
                    id="maintenance-responsible-selector"
                    label="Responsável interno (opcional)"
                    value={quick.responsibleId}
                    options={meta.maintenanceEmployees.map((employee: any) => ({
                      value: employee.id,
                      label: employee.name,
                    }))}
                    onChange={(responsibleId) =>
                      setQuick({ ...quick, responsibleId })
                    }
                    placeholder="Distribuir posteriormente"
                    emptyValueLabel="Distribuir posteriormente"
                    loading={metaQuery.isLoading}
                    errorMessage={metaQuery.isError ? (metaQuery.error as Error).message : undefined}
                  />
                </div>
              )}
              {meta.permissions.manage &&
                quick.executionType === "TERCEIRIZADA" && (
                  <div className="min-w-0 lg:col-span-2">
                    <SearchableSelect
                      id="maintenance-supplier-selector"
                      label="Empresa terceirizada (opcional)"
                      value={quick.supplierId}
                      options={meta.suppliers.map((supplier: any) => ({
                        value: supplier.id,
                        label: supplier.name,
                      }))}
                      onChange={(supplierId) =>
                        setQuick({ ...quick, supplierId })
                      }
                      placeholder="Definir posteriormente"
                      emptyValueLabel="Definir posteriormente"
                      loading={metaQuery.isLoading}
                      errorMessage={metaQuery.isError ? (metaQuery.error as Error).message : undefined}
                    />
                  </div>
                )}
              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                <label className="text-sm font-semibold">
                  Tipo
                  <select
                    className="select mt-1 min-h-12"
                    value={quick.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setQuick({
                        ...quick,
                        type,
                        priority: type === "EMERGENCIAL" ? "CRITICA" : "NORMAL",
                      });
                    }}
                  >
                    <option value="EMERGENCIAL">Emergencial</option>
                    <option value="PREVENTIVA">Preventiva</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Prioridade
                  <select
                    className="select mt-1 min-h-12"
                    value={quick.priority}
                    disabled={
                      quick.type === "EMERGENCIAL" && !meta.permissions.manage
                    }
                    onChange={(e) =>
                      setQuick({ ...quick, priority: e.target.value })
                    }
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="NORMAL">Normal</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica</option>
                  </select>
                </label>
              </div>
              <label className="text-sm font-semibold lg:col-span-2">
                Descrição do problema ou serviço
                <textarea
                  required
                  minLength={3}
                  rows={3}
                  className="textarea mt-1"
                  value={quick.description}
                  onChange={(e) =>
                    setQuick({ ...quick, description: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-semibold">
                Foto ou anexo
                <input
                  type="file"
                  accept="image/*,.pdf"
                  capture="environment"
                  className="input mt-1"
                  onChange={(e) =>
                    setQuick({ ...quick, file: e.target.files?.[0] ?? null })
                  }
                />
              </label>
              <label className="text-sm font-semibold">
                Observação complementar
                <input
                  className="input mt-1"
                  value={quick.notes}
                  onChange={(e) =>
                    setQuick({ ...quick, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <button
              className="btn-primary mt-4 min-h-12 w-full sm:w-auto"
              disabled={create.isPending}
            >
              {create.isPending ? "Enviando…" : "Abrir ordem de manutenção"}
            </button>
            {create.error && (
              <p className="mt-2 text-sm text-red-600">
                {(create.error as Error).message}
              </p>
            )}
          </form>
        </>
      )}

      {area === "history" && (
        <>
          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="section-title">
                  Consulta e movimentação das ordens
                </h2>
                <p className="text-sm text-slate-500">
                  {orders.length} ordem(ns) nos filtros atuais
                </p>
              </div>
              <div className="flex gap-2">
                {meta.permissions.export && (
                  <button className="btn-secondary" onClick={exportOrders}>
                    Exportar CSV
                  </button>
                )}
                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    className={clsx(
                      "btn",
                      view === "kanban" && "bg-white shadow",
                    )}
                    onClick={() => setView("kanban")}
                  >
                    Kanban
                  </button>
                  <button
                    className={clsx(
                      "btn",
                      view === "list" && "bg-white shadow",
                    )}
                    onClick={() => setView("list")}
                  >
                    Lista
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                className="input"
                placeholder="Nº, equipamento ou descrição"
                value={filters.search}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
              />
              <select
                className="select"
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="">Todos os status</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel[value]}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
              >
                <option value="">Todos os tipos</option>
                <option value="EMERGENCIAL">Emergencial</option>
                <option value="PREVENTIVA">Preventiva</option>
                <option value="CORRETIVA">Corretiva (legado)</option>
              </select>
              <select
                className="select"
                value={filters.priority}
                onChange={(e) =>
                  setFilters({ ...filters, priority: e.target.value })
                }
              >
                <option value="">Todas as prioridades</option>
                {["BAIXA", "NORMAL", "ALTA", "CRITICA"].map((value) => (
                  <option value={value} key={value}>
                    {priorityLabel[value]}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={filters.equipmentId}
                onChange={(e) =>
                  setFilters({ ...filters, equipmentId: e.target.value })
                }
              >
                <option value="">Todos os equipamentos</option>
                {meta.equipments.map((equipment: any) => (
                  <option value={equipment.id} key={equipment.id}>
                    {equipment.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={filters.responsibleId}
                onChange={(e) =>
                  setFilters({ ...filters, responsibleId: e.target.value })
                }
              >
                <option value="">Todos os responsáveis</option>
                {meta.maintenanceEmployees.map((employee: any) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={filters.executionType}
                onChange={(e) =>
                  setFilters({ ...filters, executionType: e.target.value })
                }
              >
                <option value="">Todas: internas e terceirizadas</option>
                <option value="INTERNA">Interna</option>
                <option value="TERCEIRIZADA">Terceirizada</option>
              </select>
              <select
                className="select"
                value={filters.supplierId}
                onChange={(e) =>
                  setFilters({ ...filters, supplierId: e.target.value })
                }
              >
                <option value="">Todas as empresas terceirizadas</option>
                {meta.suppliers.map((supplier: any) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Período inicial"
                  type="date"
                  className="input"
                  value={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                />
                <input
                  aria-label="Período final"
                  type="date"
                  className="input"
                  value={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={Object.values(filters).some(Boolean) || overdueOnly ? "font-semibold text-[#316b9d]" : "text-slate-500"}>
                {Object.values(filters).some(Boolean) || overdueOnly ? "Filtros ativos" : "Nenhum filtro ativo"}
              </span>
              {(Object.values(filters).some(Boolean) || overdueOnly) && (
                <button type="button" className="btn-secondary" onClick={() => { setFilters({ search: "", status: "", type: "", priority: "", equipmentId: "", responsibleId: "", requestedById: "", supplierId: "", executionType: "", from: "", to: "" }); setOverdueOnly(false); }}>
                  Limpar filtros
                </button>
              )}
            </div>
          </section>
          <div className="sr-only" role="status" aria-live="polite">{moveFeedback?.message}</div>
          {moveFeedback && (
            <div className={clsx("my-3 rounded-xl border p-3 text-sm font-semibold", moveFeedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")} role={moveFeedback.type === "error" ? "alert" : "status"}>
              {moveFeedback.message}
            </div>
          )}
          {ordersQuery.isLoading && (
            <div className="flex gap-3 overflow-hidden" aria-label="Carregando quadro">
              {statuses.map((status) => <div className="h-[28rem] w-[19rem] shrink-0 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" key={status} />)}
            </div>
          )}
          {ordersQuery.error && <div className="my-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800" role="alert">{(ordersQuery.error as Error).message}</div>}
          {view === "kanban" && !ordersQuery.isLoading && !ordersQuery.error ? (
            <MaintenanceKanban
              orders={orders}
              statuses={statuses}
              statusLabel={statusLabel}
              canMove={(order) => Boolean((meta.permissions.manage || meta.permissions.updateInternal) && order.status !== "CONCLUIDA" && !move.isPending)}
              validTargets={(order) => allowedTargets(order.status)}
              onMove={(order, status, position) => changeStatus(order, status, position)}
              renderCard={(order) => (
                <OrderCard
                  order={order}
                  canUpdate={Boolean(meta.permissions.manage || meta.permissions.updateInternal)}
                  onStatus={changeStatus}
                  onOpen={() => setSelectedId(order.id)}
                />
              )}
            />
          ) : null}
          {view === "list" && (
            <div className="card hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="p-2">Ordem</th>
                    <th className="p-2">Abertura</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Atendimento</th>
                    <th className="p-2">Equipamento</th>
                    <th className="p-2">Descrição</th>
                    <th className="p-2">Prioridade</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Pendência</th>
                    <th className="p-2">Responsável / empresa</th>
                    <th className="p-2">Prazo</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="cursor-pointer border-b hover:bg-slate-50" tabIndex={0} onClick={() => setSelectedId(order.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(order.id); }}>
                      <td className="p-2 font-bold">{orderCode(order)}</td>
                      <td className="p-2 whitespace-nowrap">
                        {formatDate(order.openedAt)}
                      </td>
                      <td className="p-2">{typeLabel[order.type]}</td>
                      <td className="p-2">
                        <span className="badge-neutral">
                          {executionLabel(order.executionType)}
                        </span>
                      </td>
                      <td className="p-2">{order.equipment.name}</td>
                      <td className="max-w-64 truncate p-2">
                        {order.description}
                      </td>
                      <td className="p-2">{priorityLabel[order.priority]}</td>
                      <td className="p-2">{statusLabel[order.status]}</td>
                      <td className="p-2">{order.pendencies?.[0] ? `${pendingReasons[order.pendencies[0].reason] || order.pendencies[0].reason}${order.pendencies[0].description ? ` — ${order.pendencies[0].description}` : ""}` : "—"}</td>
                      <td className="p-2">
                        {order.executionType === "TERCEIRIZADA"
                          ? order.supplier?.name || "Não definida"
                          : order.assignees
                              ?.map((item: any) => item.employee.name)
                              .join(", ") || "Não definido"}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {formatDate(order.expectedAt)}
                      </td>
                      <td className="p-2">
                        <button
                          className="btn-secondary"
                          onClick={() => setSelectedId(order.id)}
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {area === "preventive" && (
        <div className="grid gap-4 lg:grid-cols-[.9fr,1.1fr]">
          {meta.permissions.managePlans ? (
            <form className="card space-y-3" onSubmit={submitPlan}>
              <div>
                <h2 className="section-title">Novo plano preventivo</h2>
                <p className="text-sm text-slate-500">
                  A ordem será gerada uma única vez em cada período programado.
                </p>
              </div>
              <select
                required
                className="select"
                value={plan.equipmentId}
                onChange={(e) =>
                  setPlan({ ...plan, equipmentId: e.target.value })
                }
              >
                <option value="">Equipamento</option>
                {meta.equipments.map((equipment: any) => (
                  <option key={equipment.id} value={equipment.id}>
                    {equipment.name}
                  </option>
                ))}
              </select>
              <input
                required
                className="input"
                placeholder="Nome do plano"
                value={plan.title}
                onChange={(e) => setPlan({ ...plan, title: e.target.value })}
              />
              <textarea
                required
                className="textarea"
                placeholder="Descrição do serviço"
                value={plan.description}
                onChange={(e) =>
                  setPlan({ ...plan, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="select"
                  value={plan.frequency}
                  onChange={(e) =>
                    setPlan({ ...plan, frequency: e.target.value })
                  }
                >
                  {[
                    ["DIARIA", "Diária"],
                    ["SEMANAL", "Semanal"],
                    ["QUINZENAL", "Quinzenal"],
                    ["MENSAL", "Mensal"],
                    ["BIMESTRAL", "Bimestral"],
                    ["TRIMESTRAL", "Trimestral"],
                    ["SEMESTRAL", "Semestral"],
                    ["ANUAL", "Anual"],
                    ["PERSONALIZADA", "Personalizada"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  required
                  className="input"
                  value={plan.startDate}
                  onChange={(e) =>
                    setPlan({ ...plan, startDate: e.target.value })
                  }
                />
              </div>
              {plan.frequency === "PERSONALIZADA" && (
                <input
                  type="number"
                  min="1"
                  required
                  className="input"
                  placeholder="Intervalo em dias"
                  value={plan.customIntervalDays}
                  onChange={(e) =>
                    setPlan({ ...plan, customIntervalDays: e.target.value })
                  }
                />
              )}
              <select
                className="select"
                value={plan.defaultResponsibleId}
                onChange={(e) =>
                  setPlan({ ...plan, defaultResponsibleId: e.target.value })
                }
              >
                <option value="">Responsável padrão</option>
                {meta.maintenanceEmployees.map((employee: any) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
              <textarea
                className="textarea"
                placeholder="Checklist ou instruções"
                value={plan.checklistInstructions}
                onChange={(e) =>
                  setPlan({ ...plan, checklistInstructions: e.target.value })
                }
              />
              <button
                className="btn-primary w-full"
                disabled={createPlan.isPending}
              >
                Criar plano
              </button>
              {createPlan.error && (
                <p className="text-sm text-red-600">
                  {(createPlan.error as Error).message}
                </p>
              )}
            </form>
          ) : (
            <section className="card">
              <h2 className="section-title">Planos preventivos</h2>
              <p className="mt-2 text-sm text-slate-500">
                Você pode consultar a agenda. A criação e edição são restritas à
                gestão da manutenção.
              </p>
            </section>
          )}
          <section className="card">
            <h2 className="section-title">Planos ativos e agenda</h2>
            <div className="mt-4 space-y-3">
              {plansQuery.data?.map((item) => (
                <article key={item.id} className="rounded-xl border p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <strong>{item.title}</strong>
                      <p className="text-sm text-slate-600">
                        {item.equipment.name} ·{" "}
                        {item.frequency ?? `${item.triggerType} (legado)`}
                      </p>
                    </div>
                    <span
                      className={
                        item.isActive ? "badge-success" : "badge-neutral"
                      }
                    >
                      {item.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    Próxima execução: {formatDate(item.nextExecutionAt)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {area === "equipment" && (
        <section className="card">
          <h2 className="section-title">
            Equipamentos e histórico de manutenção
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {meta.equipments.map((equipment: any) => {
              const equipmentOrders = (ordersQuery.data ?? []).filter(
                (order) => order.equipmentId === equipment.id,
              );
              return (
                <article className="rounded-xl border p-4 transition hover:border-brand-400 hover:shadow" key={equipment.id}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedEquipment(equipment)}>
                  <strong>{equipment.name}</strong>
                  <p className="text-sm text-slate-500">
                    {equipment.assetTag ||
                      equipment.serialNumber ||
                      "Sem patrimônio"}{" "}
                    · {equipment.department}
                  </p>
                  <p className="mt-3 text-2xl font-bold">
                    {equipmentOrders.length}
                  </p>
                  <p className="text-xs text-slate-500">
                    ordens no histórico consultado
                  </p>
                  <span className="btn-secondary mt-3 inline-flex">Ver detalhes e histórico</span>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {area === "outsourced" && (
        <div className="grid gap-4 lg:grid-cols-[.8fr,1.2fr]">
          {meta.permissions.manage && (
            <form
              className="card space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createSupplier.mutate();
              }}
            >
              <h2 className="section-title">Cadastrar empresa terceirizada</h2>
              <p className="text-sm text-slate-500">
                Este cadastro reutiliza a estrutura de fornecedores do
                SmartCheck.
              </p>
              <input
                required
                minLength={2}
                className="input"
                placeholder="Empresa prestadora"
                value={supplierForm.name}
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, name: event.target.value })
                }
              />
              <input
                className="input"
                placeholder="CNPJ"
                value={supplierForm.document}
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    document: event.target.value,
                  })
                }
              />
              <input
                className="input"
                placeholder="Contato"
                value={supplierForm.contactName}
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    contactName: event.target.value,
                  })
                }
              />
              <input
                className="input"
                placeholder="Telefone"
                value={supplierForm.phone}
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    phone: event.target.value,
                  })
                }
              />
              <button
                className="btn-primary w-full"
                disabled={createSupplier.isPending}
              >
                Cadastrar empresa
              </button>
              {createSupplier.error && (
                <p className="text-sm text-red-600">
                  {(createSupplier.error as Error).message}
                </p>
              )}
            </form>
          )}
          <section className="card">
            <h2 className="section-title">Empresas terceirizadas</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {meta.suppliers.map((supplier: any) => (
                <article className="rounded-xl border p-4" key={supplier.id}>
                  <strong>{supplier.name}</strong>
                  <p className="text-sm text-slate-500">
                    {supplier.document || "CNPJ não informado"}
                  </p>
                  <p className="mt-2 text-sm">
                    {supplier.contactName || "Contato não informado"}
                    {supplier.phone ? ` · ${supplier.phone}` : ""}
                  </p>
                  <button
                    className="btn-secondary mt-3"
                    onClick={() => {
                      setFilters({
                        ...filters,
                        executionType: "TERCEIRIZADA",
                        supplierId: supplier.id,
                      });
                      setArea("history");
                    }}
                  >
                    Ver ordens
                  </button>
                </article>
              ))}
            </div>
            {meta.suppliers.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Nenhuma empresa cadastrada.
              </p>
            )}
          </section>
        </div>
      )}
      {selectedId && (
        <OrderDetails
          orderId={selectedId}
          meta={meta}
          onClose={() => setSelectedId(null)}
        />
      )}
      {selectedEquipment && <EquipmentDetails equipment={selectedEquipment} onClose={() => setSelectedEquipment(null)} />}
      {pendingTransition && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-labelledby="pending-dialog-title">
          <form className="card w-full max-w-lg space-y-4" onSubmit={(event) => {
            event.preventDefault();
            move.mutate({
              order: pendingTransition.order,
              targetStatus: "PENDENTE",
              targetPosition: pendingTransition.targetPosition ?? orders.filter((item) => item.status === "PENDENTE").length,
              pending: { reason: pendingTransition.reason, description: pendingTransition.description.trim() },
            });
          }}>
            <div><h2 id="pending-dialog-title" className="section-title">Registrar motivo da pendência</h2><p className="text-sm text-slate-500">A ordem só será movida depois que o motivo for salvo com sucesso.</p></div>
            <dl className="grid gap-2 rounded-xl bg-slate-100 p-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Ordem</dt><dd>{orderCode(pendingTransition.order)}</dd></div><div><dt className="text-slate-500">Equipamento</dt><dd>{pendingTransition.order.equipment.name}</dd></div><div><dt className="text-slate-500">Status anterior</dt><dd>{statusLabel[pendingTransition.order.status]}</dd></div><div><dt className="text-slate-500">Novo status</dt><dd>Pendente</dd></div></dl>
            <label className="block text-sm font-semibold">Categoria da pendência<select required autoFocus className="select mt-1" value={pendingTransition.reason} onChange={(event) => setPendingTransition({ ...pendingTransition, reason: event.target.value })}><option value="">Selecione</option>{Object.entries(pendingReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-sm font-semibold">Motivo da pendência<textarea required minLength={3} className="textarea mt-1" value={pendingTransition.description} onChange={(event) => setPendingTransition({ ...pendingTransition, description: event.target.value })} /></label>
            {move.error && <p className="text-sm text-red-600" role="alert">{(move.error as Error).message}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setPendingTransition(null)}>Cancelar</button><button className="btn-primary" disabled={move.isPending || !pendingTransition.reason || pendingTransition.description.trim().length < 3}>{move.isPending ? "Movendo…" : "Confirmar pendência"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
