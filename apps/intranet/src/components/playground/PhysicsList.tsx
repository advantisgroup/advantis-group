"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";

import { DROP_PREVIEW, usePhysicsDrag } from "@/hooks/use-physics-drag";
import { cn } from "@/lib/utils";

/** Pixels the pointer has to travel before a press becomes a drag. */
const START_THRESHOLD = 4;

type Pending = { id: string; el: HTMLElement; x: number; y: number; pointerId: number };
type Active = { id: string; width: number; height: number };

/**
 * The sidebar editor's drag, cut down to one list: press, pull, and the row
 * lifts and swings behind the pointer; let go and it flies into its slot.
 */
export function PhysicsList({
  items,
  onChange,
  label,
  wobbly,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  label: (id: string) => string;
  wobbly: boolean;
}) {
  const physics = usePhysicsDrag(wobbly ? { maxTilt: 28, restingTilt: 7 } : undefined);
  const [drag, setDrag] = useState<Active | null>(null);
  const [dropping, setDropping] = useState(false);
  const dragRef = useRef<Active | null>(null);
  const pending = useRef<Pending | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const rows = useRef(new Map<string, HTMLElement>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Where the dragged row belongs: after every other row whose middle is
  // above the pointer.
  const hitTest = useCallback(() => {
    const active = dragRef.current;
    if (!active) return;
    const current = itemsRef.current;
    let index = 0;
    for (const id of current) {
      if (id === active.id) continue;
      const rect = rows.current.get(id)?.getBoundingClientRect();
      if (rect && rect.top + rect.height / 2 < pointer.current.y) index++;
    }
    if (current.indexOf(active.id) === index) return;
    const next = current.filter((id) => id !== active.id);
    next.splice(index, 0, active.id);
    onChange(next);
  }, [onChange]);

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

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const p = pending.current;
      if (p && e.pointerId === p.pointerId && !dragRef.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < START_THRESHOLD) return;
        const rect = p.el.getBoundingClientRect();
        physics.pickUp(
          rect,
          { x: p.x, y: p.y },
          { x: e.clientX, y: e.clientY },
          { x: Math.min(28, rect.width / 3), y: rect.height / 2 },
        );
        const next = { id: p.id, width: rect.width, height: rect.height };
        dragRef.current = next;
        setDrag(next);
        document.body.style.userSelect = "none";
        return;
      }
      if (!dragRef.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      physics.move(e.clientX, e.clientY);
    }
    function onUp() {
      pending.current = null;
      const active = dragRef.current;
      if (!active || dropping) return;
      document.body.style.userSelect = "";
      setDropping(true);
      void physics
        .drop(() => rows.current.get(active.id)?.getBoundingClientRect())
        .then(() => {
          dragRef.current = null;
          setDrag(null);
          setDropping(false);
        });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [physics, dropping]);

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {items.map((id) => (
          <motion.li
            key={id}
            layout="position"
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            ref={(el: HTMLLIElement | null) => {
              if (el) rows.current.set(id, el);
              else rows.current.delete(id);
            }}
            onPointerDown={(e) => {
              if (drag || e.button !== 0) return;
              if (e.pointerType !== "mouse" && !(e.target as HTMLElement).closest("[data-grip]"))
                return;
              pointer.current = { x: e.clientX, y: e.clientY };
              pending.current = {
                id,
                el: e.currentTarget,
                x: e.clientX,
                y: e.clientY,
                pointerId: e.pointerId,
              };
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            {drag?.id === id ? (
              <div className={cn("h-11 rounded-lg", DROP_PREVIEW)} />
            ) : (
              <Row label={label(id)} />
            )}
          </motion.li>
        ))}
      </ul>
      {drag &&
        createPortal(
          <motion.div
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[100] origin-left rounded-lg"
            style={{ ...physics.style, width: drag.width, height: drag.height }}
          >
            <Row label={label(drag.id)} lifted />
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function Row({ label, lifted }: { label: string; lifted?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-3 rounded-lg border border-border/70 bg-background px-3 text-sm",
        lifted && "border-border",
      )}
    >
      <span
        data-grip
        className="grid size-6 touch-none place-items-center text-muted-foreground/60"
      >
        <GripVertical className="size-4" />
      </span>
      {label}
    </div>
  );
}
