import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getUploadedFileUrl } from "../lib/api";
import { formatBrazilDateTime } from "../lib/datetime";
import { formatChecklistReadings } from "../lib/checklistReadings";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function HistoricoChecklistPage() {
  const [equipmentId, setEquipmentId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyWithFailures, setOnlyWithFailures] = useState(false);
  const [openedHistoryDetails, setOpenedHistoryDetails] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewZoomed, setPreviewZoomed] = useState(false);

  const equipmentsQuery = useQuery({
    queryKey: ["equipments"],
    queryFn: () => apiRequest<any[]>("/equipments"),
    refetchInterval: 60000,
    refetchIntervalInBackground: true
  });

  const equipmentHistoryQuery = useQuery({
    queryKey: ["equipment-history", equipmentId],
    queryFn: () => apiRequest<any>(`/history/equipment/${equipmentId}`),
    enabled: Boolean(equipmentId),
    refetchInterval: equipmentId ? 15000 : false,
    refetchIntervalInBackground: true
  });

  const selectedEquipment = useMemo(
    () => equipmentsQuery.data?.find((equipment) => equipment.id === equipmentId),
    [equipmentsQuery.data, equipmentId]
  );

  const filteredHistory = useMemo(() => {
    if (!equipmentHistoryQuery.data) {
      return { checklists: [], maintenances: [] };
    }

    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const inRange = (value: string) => {
      const date = new Date(value);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    };

    return {
      checklists: (equipmentHistoryQuery.data.checklists ?? []).filter((item: any) => {
        if (!inRange(item.executedAt)) return false;
        if (onlyWithFailures && !item.hadProblem) return false;
        return true;
      }),
      maintenances: (equipmentHistoryQuery.data.maintenances ?? []).filter((item: any) => inRange(item.openedAt))
    };
  }, [equipmentHistoryQuery.data, dateFrom, dateTo, onlyWithFailures]);

  function printReport() {
    if (!equipmentId || !selectedEquipment) return;

    const checklistRows = filteredHistory.checklists
      .map(
        (execution: any) => `
          <tr>
            <td>${escapeHtml(execution.template?.name ?? "-")}</td>
            <td>${escapeHtml(formatBrazilDateTime(execution.executedAt))}</td>
            <td>${formatChecklistReadings(execution).map(escapeHtml).join("<br/>") || "-"}</td>
            <td>${execution.hadProblem ? "Com falha" : "Sem falha"}</td>
            <td>${execution.hadProblem ? execution.items?.length ?? 0 : 0}</td>
          </tr>
        `
      )
      .join("");

    const failuresBlocks = filteredHistory.checklists
      .filter((execution: any) => execution.hadProblem && (execution.items?.length ?? 0) > 0)
      .map(
        (execution: any) => `
          <div style="border:1px solid #fecaca; border-radius:8px; padding:8px; margin-top:8px;">
            <p><strong>${escapeHtml(execution.template?.name ?? "Checklist")}</strong> - ${escapeHtml(
              formatBrazilDateTime(execution.executedAt)
            )}</p>
            ${(execution.items ?? [])
              .map(
                (item: any) => `
                <p style="margin:4px 0 0 0;">
                  <strong>Item:</strong> ${escapeHtml(item.templateItem?.label ?? "-")}<br/>
                  <strong>Observacao:</strong> ${escapeHtml(item.observation?.trim() ? item.observation : "-")}
                </p>
              `
              )
              .join("")}
          </div>
        `
      )
      .join("");

    const maintenanceRows = filteredHistory.maintenances
      .map(
        (maintenance: any) => `
          <tr>
            <td>${escapeHtml(maintenance.description ?? "-")}</td>
            <td>${escapeHtml(maintenance.type ?? "-")}</td>
            <td>${escapeHtml(maintenance.status ?? "-")}</td>
            <td>${escapeHtml(formatBrazilDateTime(maintenance.openedAt))}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatorio de historico de checklist</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1, h2 { margin: 0 0 10px 0; }
            p { margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Relatorio de historico de checklist</h1>
          <p><strong>Equipamento:</strong> ${escapeHtml(selectedEquipment.name ?? "-")}</p>
          <p><strong>Periodo:</strong> ${escapeHtml(dateFrom || "-")} ate ${escapeHtml(dateTo || "-")}</p>

          <h2>Checklists</h2>
          <table>
            <thead>
              <tr>
                <th>Checklist</th>
                <th>Data/hora</th>
                <th>Leituras</th>
                <th>Status</th>
                <th>Falhas</th>
              </tr>
            </thead>
            <tbody>${checklistRows || '<tr><td colspan="5">Sem registros no periodo.</td></tr>'}</tbody>
          </table>

          <h2 style="margin-top: 16px;">Detalhes das falhas</h2>
          ${failuresBlocks || "<p>Nenhuma falha no periodo.</p>"}

          <h2 style="margin-top: 16px;">Manutencoes relacionadas</h2>
          <table>
            <thead>
              <tr>
                <th>Descricao</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Data abertura</th>
              </tr>
            </thead>
            <tbody>${maintenanceRows || '<tr><td colspan="4">Sem manutencoes no periodo.</td></tr>'}</tbody>
          </table>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">Historico de checklist</h2>
        <p className="text-sm text-slate-500">
          Selecione o equipamento para visualizar o historico de checklists e manutencoes relacionadas.
        </p>
        <select
          className="select"
          value={equipmentId}
          onChange={(event) => {
            setEquipmentId(event.target.value);
            setOpenedHistoryDetails({});
          }}
        >
          <option value="">Selecione o equipamento</option>
          {equipmentsQuery.data?.map((equipment) => (
            <option key={equipment.id} value={equipment.id}>
              {equipment.name}
            </option>
          ))}
        </select>
        <div className="grid gap-2 md:grid-cols-[1fr,1fr,220px]">
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={printReport}
            disabled={!equipmentId}
          >
            Imprimir relatorio
          </button>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={onlyWithFailures}
            onChange={(event) => setOnlyWithFailures(event.target.checked)}
          />
          Somente com falha
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Historico operacional do equipamento</h2>
        {!equipmentId && (
          <p className="text-sm text-slate-500">Selecione um equipamento para consultar o historico operacional.</p>
        )}
        {equipmentHistoryQuery.data && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-semibold">Ultimos checklists</h3>
              <div className="space-y-2">
                {filteredHistory.checklists.slice(0, 40).map((execution: any) => (
                  <div key={execution.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{execution.template.name}</p>
                    <p className="text-slate-600">{formatBrazilDateTime(execution.executedAt)}</p>
                    {formatChecklistReadings(execution).map((reading) => (
                      <p key={reading} className="font-medium text-slate-700">
                        {reading}
                      </p>
                    ))}
                    <p className={execution.hadProblem ? "text-red-700" : "text-emerald-700"}>
                      {execution.hadProblem ? "Com falha" : "Sem falha"}
                    </p>
                    {execution.hadProblem && execution.items?.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setOpenedHistoryDetails((prev) => ({
                              ...prev,
                              [execution.id]: !prev[execution.id]
                            }))
                          }
                        >
                          {openedHistoryDetails[execution.id] ? "Ocultar falhas" : "Ver falhas"}
                        </button>

                        {openedHistoryDetails[execution.id] && (
                          <div className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-2">
                            {execution.items.map((problemItem: any) => (
                              <div key={problemItem.id} className="rounded-lg border border-red-200 bg-white p-2">
                                <p className="font-semibold text-red-800">{problemItem.templateItem?.label ?? "Item"}</p>
                                <p className="text-sm text-slate-700">
                                  Observacao: {problemItem.observation?.trim() ? problemItem.observation : "-"}
                                </p>
                                {problemItem.attachments?.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {problemItem.attachments.map((attachment: any) => {
                                      const imageUrl = getUploadedFileUrl(attachment.path);
                                      if (!imageUrl) return null;
                                      return (
                                        <button
                                          key={attachment.id}
                                          className="block"
                                          type="button"
                                          onClick={() => {
                                            setPreviewImageUrl(imageUrl);
                                            setPreviewZoomed(false);
                                          }}
                                        >
                                          <img
                                            src={imageUrl}
                                            alt="Foto da falha"
                                            className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {filteredHistory.checklists.length === 0 && (
                  <p className="text-sm text-slate-500">Sem checklists no periodo selecionado.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-semibold">Manutencoes</h3>
              <div className="space-y-2">
                {filteredHistory.maintenances.slice(0, 40).map((maintenance: any) => (
                  <div key={maintenance.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{maintenance.description}</p>
                    <p className="text-slate-600">
                      {maintenance.type} | {maintenance.status}
                    </p>
                  </div>
                ))}
                {filteredHistory.maintenances.length === 0 && (
                  <p className="text-sm text-slate-500">Sem manutencoes no periodo selecionado.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setPreviewImageUrl(null);
            setPreviewZoomed(false);
          }}
        >
          <div className="relative">
            <img
              src={previewImageUrl}
              alt="Visualizacao da falha"
              className={`rounded-lg border border-slate-200 bg-white object-contain transition ${
                previewZoomed ? "max-h-none max-w-none scale-[1.8] cursor-zoom-out" : "max-h-[90vh] max-w-[90vw] cursor-zoom-in"
              }`}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setPreviewZoomed((prev) => !prev);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
