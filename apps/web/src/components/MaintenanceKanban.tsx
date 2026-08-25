import { PointerEvent as ReactPointerEvent, ReactNode, useRef, useState } from "react";
import clsx from "clsx";

type KanbanOrder = {
  id: string;
  number: number;
  status: string;
  kanbanPosition?: number;
  equipment: { name: string };
};

type DragState = {
  order: KanbanOrder;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceStatus: string;
  sourceIndex: number;
  targetStatus: string;
  targetIndex: number;
};

export function MaintenanceKanban({
  orders,
  statuses,
  statusLabel,
  canMove,
  validTargets,
  onMove,
  renderCard,
}: {
  orders: KanbanOrder[];
  statuses: string[];
  statusLabel: Record<string, string>;
  canMove: (order: KanbanOrder) => boolean;
  validTargets: (order: KanbanOrder) => string[];
  onMove: (order: KanbanOrder, status: string, position: number) => void;
  renderCard: (order: KanbanOrder, options: { dragging: boolean }) => ReactNode;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClickUntil = useRef(0);
  const candidate = useRef<null | {
    order: KanbanOrder;
    pointerId: number;
    startX: number;
    startY: number;
    sourceIndex: number;
    width: number;
    height: number;
  }>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const byStatus = (status: string) => orders
    .filter((order) => order.status === status)
    .sort((a, b) => (a.kanbanPosition ?? 0) - (b.kanbanPosition ?? 0));

  function startCandidate(event: ReactPointerEvent<HTMLElement>, order: KanbanOrder) {
    if (!canMove(order) || event.button !== 0) return;
    const interactive = (event.target as HTMLElement).closest<HTMLElement>("button, a, input, select, textarea, details, summary");
    if (interactive && !interactive.hasAttribute("data-kanban-open")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    candidate.current = {
      order,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceIndex: byStatus(order.status).findIndex((item) => item.id === order.id),
      width: rect.width,
      height: rect.height,
    };
    boardRef.current?.setPointerCapture(event.pointerId);
  }

  function locateTarget(x: number, y: number, order: KanbanOrder) {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const column = element?.closest<HTMLElement>("[data-kanban-column]");
    const targetStatus = column?.dataset.kanbanColumn;
    if (!targetStatus || !validTargets(order).includes(targetStatus)) return null;
    const cards = Array.from(column.querySelectorAll<HTMLElement>("[data-kanban-card]"))
      .filter((card) => card.dataset.kanbanCard !== order.id);
    let targetIndex = cards.length;
    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        targetIndex = index;
        break;
      }
    }
    return { targetStatus, targetIndex };
  }

  function autoScroll(x: number, y: number) {
    const board = boardRef.current;
    if (board) {
      const rect = board.getBoundingClientRect();
      const edge = 72;
      if (x < rect.left + edge) board.scrollLeft -= 18;
      if (x > rect.right - edge) board.scrollLeft += 18;
    }
    const verticalEdge = 80;
    if (y < verticalEdge) window.scrollBy({ top: -16, behavior: "auto" });
    if (y > window.innerHeight - verticalEdge) window.scrollBy({ top: 16, behavior: "auto" });
  }

  function movePointer(event: ReactPointerEvent<HTMLElement>) {
    const pending = candidate.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
    const threshold = event.pointerType === "touch" ? 10 : 6;
    if (!drag && distance < threshold) return;
    event.preventDefault();
    autoScroll(event.clientX, event.clientY);
    const target = locateTarget(event.clientX, event.clientY, pending.order) ?? {
      targetStatus: pending.order.status,
      targetIndex: pending.sourceIndex,
    };
    setDrag({
      order: pending.order,
      x: event.clientX,
      y: event.clientY,
      width: pending.width,
      height: pending.height,
      sourceStatus: pending.order.status,
      sourceIndex: pending.sourceIndex,
      ...target,
    });
  }

  function finishPointer(event: ReactPointerEvent<HTMLElement>) {
    if (!candidate.current || candidate.current.pointerId !== event.pointerId) return;
    const completed = drag;
    candidate.current = null;
    setDrag(null);
    if (completed) {
      suppressClickUntil.current = Date.now() + 300;
      onMove(completed.order, completed.targetStatus, completed.targetIndex);
    }
  }

  return (
    <div
      ref={boardRef}
      className="maintenance-kanban flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3"
      aria-label="Quadro Kanban das ordens de manutenção"
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onClickCapture={(event) => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      {statuses.map((status) => {
        const columnOrders = byStatus(status).filter((order) => order.id !== drag?.order.id);
        const acceptsDrop = Boolean(drag && validTargets(drag.order).includes(status));
        const displayItems: Array<KanbanOrder | "placeholder"> = [...columnOrders];
        if (drag?.targetStatus === status) displayItems.splice(drag.targetIndex, 0, "placeholder");
        return (
          <section
            key={status}
            data-kanban-column={status}
            className={clsx(
              "min-h-[28rem] w-[min(85vw,19rem)] shrink-0 snap-start rounded-2xl border p-3 transition-colors motion-reduce:transition-none",
              acceptsDrop ? "border-[#316b9d] bg-blue-50/80" : "border-slate-200 bg-slate-200/70",
            )}
            aria-label={`${statusLabel[status]}, ${byStatus(status).length} ordens`}
          >
            <header className="sticky top-0 z-[1] mb-3 flex items-center justify-between rounded-xl bg-inherit py-1">
              <h3 className="font-extrabold text-[#0b2341]">{statusLabel[status]}</h3>
              <span className="badge-neutral" aria-label={`${byStatus(status).length} cards`}>{byStatus(status).length}</span>
            </header>
            <div className="space-y-3" data-kanban-list={status}>
              {displayItems.map((item, index) => item === "placeholder" ? (
                <div
                  className="h-28 rounded-2xl border-2 border-dashed border-[#316b9d] bg-blue-100/70"
                  data-kanban-placeholder
                  aria-label={`Soltar na posição ${index + 1} de ${statusLabel[status]}`}
                  key={`placeholder-${status}`}
                />
              ) : (
                <div
                  data-kanban-card={item.id}
                  key={item.id}
                  onPointerDown={(event) => startCandidate(event, item)}
                  className={clsx("touch-pan-y", canMove(item) && "cursor-grab active:cursor-grabbing")}
                >
                  {renderCard(item, { dragging: drag?.order.id === item.id })}
                </div>
              ))}
              {displayItems.length === 0 && (
                <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-sm text-slate-500">
                  Nenhuma ordem nesta etapa
                </div>
              )}
            </div>
          </section>
        );
      })}
      {drag && (
        <div
          className="pointer-events-none fixed z-[80] -rotate-1 rounded-2xl border border-[#316b9d] bg-white p-3 shadow-[0_24px_60px_rgba(11,42,78,0.28)] motion-reduce:rotate-0"
          style={{ left: drag.x + 14, top: drag.y + 14, width: drag.width, maxWidth: "19rem" }}
          aria-hidden="true"
        >
          <strong>OS-{String(drag.order.number).padStart(6, "0")}</strong>
          <p className="mt-1 font-semibold text-slate-800">{drag.order.equipment.name}</p>
          <p className="mt-2 text-xs font-semibold text-[#316b9d]">Destino: {statusLabel[drag.targetStatus]}, posição {drag.targetIndex + 1}</p>
        </div>
      )}
    </div>
  );
}
