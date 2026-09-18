"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { motion } from "framer-motion";
import { EyeOff, GripVertical, Maximize2, Minimize2, RectangleHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { DROP_PREVIEW, usePhysicsDrag } from "@/hooks/use-physics-drag";
import { cn } from "@/lib/utils";

import { DashCardSizeContext, DashSurface, type DashCardSize } from "./primitives";

export interface GridWidget {
  id: string;
  label: string;
  node: ReactNode;
  size: DashCardSize;
}

interface Drag {
  id: string;
  width: number;
  height: number;
}

interface Resize {
  id: string;
  startX: number;
  startY: number;
  colWidth: number;
  gap: number;
  height: number;
}

const SIZES: { size: DashCardSize; icon: typeof Minimize2 }[] = [
  { size: "compact", icon: Minimize2 },
  { size: "normal", icon: Maximize2 },
  { size: "wide", icon: RectangleHorizontal },
];

function spanClass(size: DashCardSize) {
  return size === "wide" ? "sm:col-span-2" : undefined;
}

/**
 * A dashboard section's cards. Outside edit mode it's the plain joined
 * surface; in edit mode the cards come apart into tiles that can be dragged
 * into a new order, resized by pulling their corner (or the size switch), and
 * hidden. Every move and resize shows a dashed preview of the outcome first.
 */
export function EditableGrid({
  widgets,
  editing,
  onReorder,
  onResize,
  onHide,
}: {
  widgets: GridWidget[];
  editing: boolean;
  onReorder: (ids: string[]) => void;
  onResize: (id: string, size: DashCardSize) => void;
  onHide: (id: string) => void;
}) {
  const t = useTranslations("Dashboard");
  const physics = usePhysicsDrag({ maxTilt: 6, restingTilt: 1.5 });
  const [order, setOrder] = useState(() => widgets.map((w) => w.id));
  const orderRef = useRef(order);
  orderRef.current = order;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dropping, setDropping] = useState(false);
  const pending = useRef<{ id: string; el: HTMLElement; x: number; y: number; pointerId: number }>(
    null,
  );
  const pointer = useRef({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const tileEls = useRef(new Map<string, HTMLElement>());

  // Cards fade in once, on page load — not again when a dropped card remounts.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const [resize, setResize] = useState<Resize | null>(null);
  const [preview, setPreview] = useState<{ id: string; size: DashCardSize } | null>(null);

  const idsKey = widgets.map((w) => w.id).join("|");
  useEffect(() => {
    if (!dragRef.current) setOrder(widgets.map((w) => w.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const byId = new Map(widgets.map((w) => [w.id, w]));

  // The card under the pointer gives up its slot — with the dragged one's
  // placeholder now sitting there, the pointer stays inside it and nothing
  // flips back. Offsets rather than rects: the layout animations use
  // transforms, and measuring those mid-flight made targets jitter.
  const hitTest = useCallback(() => {
    const active = dragRef.current;
    const grid = gridRef.current;
    if (!active || !grid) return;
    const rect = grid.getBoundingClientRect();
    const lx = pointer.current.x - rect.left;
    const ly = pointer.current.y - rect.top;
    const current = orderRef.current;
    for (const id of current) {
      if (id === active.id) continue;
      const el = tileEls.current.get(id);
      if (!el) continue;
      if (
        lx >= el.offsetLeft &&
        lx <= el.offsetLeft + el.offsetWidth &&
        ly >= el.offsetTop &&
        ly <= el.offsetTop + el.offsetHeight
      ) {
        const next = current.filter((i) => i !== active.id);
        next.splice(current.indexOf(id), 0, active.id);
        setOrder(next);
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!drag || dropping) return;
    let frame = 0;
    const tick = () => {
      hitTest();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag, dropping, hitTest]);

  const begin = useCallback(
    (p: { id: string; el: HTMLElement; x: number; y: number }, cx: number, cy: number) => {
      const rect = p.el.getBoundingClientRect();
      const next = { id: p.id, width: rect.width, height: rect.height };
      pointer.current = { x: cx, y: cy };
      physics.pickUp(rect, { x: p.x, y: p.y }, { x: cx, y: cy }, { x: 36, y: 28 });
      dragRef.current = next;
      setDrag(next);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [physics],
  );

  const finish = useCallback(() => {
    const active = dragRef.current;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (!active) return;
    setDropping(true);
    onReorder(orderRef.current);
    void physics
      .drop(() => tileEls.current.get(active.id)?.getBoundingClientRect())
      .then(() => {
        dragRef.current = null;
        setDrag(null);
        setDropping(false);
      });
  }, [onReorder, physics]);

  function resizePreview(r: Resize, cx: number, cy: number): DashCardSize {
    const base = byId.get(r.id)?.size ?? "normal";
    const baseCols = base === "wide" ? 2 : 1;
    const cols = Math.max(1, Math.min(2, Math.round(baseCols + (cx - r.startX) / r.colWidth)));
    if (cols === 2) return "wide";
    const dy = cy - r.startY;
    if (base === "compact") return dy > 48 ? "normal" : "compact";
    return dy < -48 ? "compact" : "normal";
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (resize) {
        setPreview({ id: resize.id, size: resizePreview(resize, e.clientX, e.clientY) });
        return;
      }
      const p = pending.current;
      if (p && e.pointerId === p.pointerId && !dragRef.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 4) begin(p, e.clientX, e.clientY);
        return;
      }
      if (!dragRef.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      physics.move(e.clientX, e.clientY);
    }
    function onUp(e: PointerEvent) {
      if (resize) {
        const size = resizePreview(resize, e.clientX, e.clientY);
        if (size !== byId.get(resize.id)?.size) onResize(resize.id, size);
        setResize(null);
        setPreview(null);
        document.body.style.cursor = "";
        return;
      }
      if (pending.current && e.pointerId === pending.current.pointerId) pending.current = null;
      if (dragRef.current && !dropping) finish();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  function startDrag(id: string) {
    return (e: React.PointerEvent<HTMLElement>) => {
      if (!editing || drag || resize || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button:not([data-drag-handle]), [data-resize-handle]")) return;
      // Touch drags only from the grip, so the page still scrolls.
      if (e.pointerType !== "mouse" && !target.closest("[data-drag-handle]")) return;
      const p = { id, el: e.currentTarget, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      pending.current = p;
      if (e.pointerType !== "mouse") {
        e.preventDefault();
        begin(p, e.clientX, e.clientY);
      }
    };
  }

  function startResize(id: string) {
    return (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const tile = tileEls.current.get(id);
      const grid = gridRef.current;
      if (!tile || !grid) return;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const size = byId.get(id)?.size ?? "normal";
      const colWidth = size === "wide" ? (tile.offsetWidth - gap) / 2 : tile.offsetWidth;
      setResize({
        id,
        startX: e.clientX,
        startY: e.clientY,
        colWidth,
        gap,
        height: tile.offsetHeight,
      });
      setPreview({ id, size });
      document.body.style.cursor = "nwse-resize";
    };
  }

  /** The dashed outline of what the card would become, drawn from its corner. */
  function sizePreview(w: GridWidget) {
    if (!preview || preview.id !== w.id || preview.size === w.size) return null;
    const tile = tileEls.current.get(w.id);
    const grid = gridRef.current;
    if (!tile || !grid) return null;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const colWidth = w.size === "wide" ? (tile.offsetWidth - gap) / 2 : tile.offsetWidth;
    const width = preview.size === "wide" ? colWidth * 2 + gap : colWidth;
    const height =
      preview.size === "compact"
        ? Math.min(tile.offsetHeight, 176)
        : w.size === "compact"
          ? tile.offsetHeight + 96
          : tile.offsetHeight;
    return (
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, width, height }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
        className={cn("pointer-events-none absolute left-0 top-0 z-20 rounded-2xl", DROP_PREVIEW)}
      />
    );
  }

  const dragged = drag ? byId.get(drag.id) : undefined;

  return (
    <DashSurface editing={editing} gridRef={gridRef}>
      {order.map((id, i) => {
        const w = byId.get(id);
        if (!w) return null;
        const isDragged = drag?.id === id;
        return (
          <motion.div
            key={id}
            layout={editing ? "position" : false}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            ref={(el: HTMLDivElement | null) => {
              if (el) tileEls.current.set(id, el);
              else tileEls.current.delete(id);
            }}
            onPointerDown={startDrag(id)}
            className={cn(
              "relative",
              spanClass(w.size),
              editing && !isDragged && "cursor-grab active:cursor-grabbing",
              // The placeholder keeps the slot at the card's size.
              isDragged && "!border-transparent !bg-transparent",
            )}
          >
            {isDragged ? (
              <div
                className={cn("h-full rounded-2xl", DROP_PREVIEW)}
                style={{ minHeight: drag.height }}
              />
            ) : (
              <>
                {/* The entrance animation lives in here: it animates
                    `transform`, which would fight the tile's own layout
                    animation if both sat on the same element. */}
                <div
                  style={{ animationDelay: `${0.04 * i}s` }}
                  className={cn(
                    "h-full",
                    !entered && "opacity-0 animate-[fadeInUp_0.5s_ease-out_forwards]",
                    editing && "pointer-events-none select-none",
                  )}
                >
                  <DashCardSizeContext.Provider value={w.size}>
                    {w.node}
                  </DashCardSizeContext.Provider>
                </div>
                {editing && (
                  <>
                    <button
                      type="button"
                      data-drag-handle
                      aria-label={t("editDrag", { name: w.label })}
                      className="absolute left-1.5 top-2 grid size-8 touch-none place-items-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/95 p-0.5 shadow-sm backdrop-blur">
                      {SIZES.map(({ size, icon: Icon }) => (
                        <button
                          key={size}
                          type="button"
                          aria-label={t(`editSize_${size}`)}
                          aria-pressed={w.size === size}
                          title={t(`editSize_${size}`)}
                          onPointerEnter={() => !resize && setPreview({ id, size })}
                          onPointerLeave={() => !resize && setPreview(null)}
                          onClick={() => {
                            setPreview(null);
                            if (w.size !== size) onResize(id, size);
                          }}
                          className={cn(
                            "grid size-8 place-items-center rounded-md transition-colors sm:size-7",
                            w.size === size
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            size === "wide" && "hidden sm:grid",
                          )}
                        >
                          <Icon className="size-3.5" />
                        </button>
                      ))}
                      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                      <button
                        type="button"
                        aria-label={t("editHide", { name: w.label })}
                        title={t("editHide", { name: w.label })}
                        onClick={() => onHide(id)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-7"
                      >
                        <EyeOff className="size-3.5" />
                      </button>
                    </div>
                    <span
                      data-resize-handle
                      onPointerDown={startResize(id)}
                      aria-hidden
                      className="absolute bottom-1 right-1 hidden size-5 cursor-nwse-resize touch-none rounded-br-xl border-b-2 border-r-2 border-muted-foreground/40 transition-colors hover:border-sky-500 sm:block"
                    />
                    {sizePreview(w)}
                  </>
                )}
              </>
            )}
          </motion.div>
        );
      })}

      {drag &&
        dragged &&
        createPortal(
          <motion.div
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[100] origin-top-left overflow-hidden rounded-2xl border border-border/70 bg-card"
            style={{ ...physics.style, width: drag.width, height: drag.height }}
          >
            <DashCardSizeContext.Provider value={dragged.size}>
              {dragged.node}
            </DashCardSizeContext.Provider>
          </motion.div>,
          document.body,
        )}
    </DashSurface>
  );
}
