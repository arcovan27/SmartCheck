import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getUploadedFileUrl } from "../lib/api";
import { formatBrazilDateTime } from "../lib/datetime";

export function HistoricoChecklistPage() {
  const [equipmentId, setEquipmentId] = useState("");
  const [openedHistoryDetails, setOpenedHistoryDetails] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewZoomed, setPreviewZoomed] = useState(false);

  const equipmentsQuery = useQuery({
    queryKey: ["equipments"],
    queryFn: () => apiRequest<any[]>("/equipments")
  });

  const equipmentHistoryQuery = useQuery({
    queryKey: ["equipment-history", equipmentId],
    queryFn: () => apiRequest<any>(`/history/equipment/${equipmentId}`),
    enabled: Boolean(equipmentId)
  });

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
          onChange={(event) => setEquipmentId(event.target.value)}
        >
          <option value="">Selecione o equipamento</option>
          {equipmentsQuery.data?.map((equipment) => (
            <option key={equipment.id} value={equipment.id}>
              {equipment.name}
            </option>
          ))}
        </select>
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
                {equipmentHistoryQuery.data.checklists.slice(0, 12).map((execution: any) => (
                  <div key={execution.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{execution.template.name}</p>
                    <p className="text-slate-600">{formatBrazilDateTime(execution.executedAt)}</p>
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
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-semibold">Manutencoes</h3>
              <div className="space-y-2">
                {equipmentHistoryQuery.data.maintenances.slice(0, 12).map((maintenance: any) => (
                  <div key={maintenance.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold">{maintenance.description}</p>
                    <p className="text-slate-600">
                      {maintenance.type} | {maintenance.status}
                    </p>
                  </div>
                ))}
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
