"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  moveSidebarItem,
  moveSidebarSection,
  removeSidebarSection,
  type SidebarSection,
} from "@/components/layout/sidebar-layout";
import { SidebarGroup, SidebarMenu, useSidebar } from "@/components/ui/sidebar";
import { DROP_PREVIEW, usePhysicsDrag } from "@/hooks/use-physics-drag";
import { cn } from "@/lib/utils";

type DragKind = "item" | "section";

interface ActiveDrag {
  kind: DragKind;
  id: string;
  width: number;
  height: number;
}

interface PendingDrag {
  kind: DragKind;
  id: string;
  el: HTMLElement;
  startX: number;
  startY: number;
  pointerId: number;
}

const START_THRESHOLD = 4;
const EDGE = 48;


function RowVisual({ children, lifted }: { children: ReactNode; lifted?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground [&>svg]:size-[18px] [&>svg]:shrink-0",
        lifted ? "bg-sidebar ring-1 ring-sidebar-border" : "bg-sidebar-accent/50",
      )}
    >
      {children}
    </div>
  );
}

export function SidebarSections({
  sections,
  collapsed,
  sectionLabel,
  renderLink,
  renderItemContent,
  isActive,
  onToggleSection,
  onChange,
}: {
  sections: SidebarSection[];
  collapsed: Set<string>;
  sectionLabel: (section: SidebarSection) => string;
  renderLink: (href: string) => ReactNode;
  /** Icon + label, used for the edit rows and the dragged piece. */
  renderItemContent: (href: string) => ReactNode;
  isActive: (href: string) => boolean;
  onToggleSection: (id: string) => void;
  onChange: (sections: SidebarSection[]) => void;
}) {
  const t = useTranslations("Nav");
  const { editing, state, isMobile } = useSidebar();
  const rail = state === "collapsed" && !isMobile;

  const [draft, setDraft] = useState(sections);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [focusId, setFocusId] = useState<string | null>(null);
  const sectionsKey = JSON.stringify(sections);
  useEffect(() => {
    // Never yank the list out from under an active drag.
    if (!dragRef.current) setDraft(sections);
    // Keyed on content — the parent hands over a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, editing]);

  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const [dropping, setDropping] = useState(false);
  const dragRef = useRef<ActiveDrag | null>(null);
  const pending = useRef<PendingDrag | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef(new Map<string, HTMLElement>());
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const pointer = useRef({ x: 0, y: 0 });

  const physics = usePhysicsDrag();

  // Hit-test entirely in viewport coordinates. The pointer uses clientX/clientY,
  // and getBoundingClientRect() returns viewport coordinates too. This avoids the
  // coordinate-system mismatch that made the drop zone appear far away from the
  // mouse in the sidebar.
  const hitTest = useCallback(() => {
    const active = dragRef.current;
    if (!active) return;

    const current = draftRef.current;

    if (active.kind === "section") {
      const others = current.filter((s) => s.id !== active.id);
      let index = 0;

      for (const s of others) {
        const el = sectionEls.current.get(s.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.top + rect.height / 2 < pointer.current.y) index++;
      }

      const from = current.findIndex((s) => s.id === active.id);
      if (from !== index) setDraft(moveSidebarSection(current, active.id, index));
      return;
    }

    // Pick the section the pointer is over (or the nearest one).
    let target = current[0];
    let best = Infinity;

    for (const s of current) {
      const el = sectionEls.current.get(s.id);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      const distance =
        pointer.current.y < rect.top
          ? rect.top - pointer.current.y
          : pointer.current.y > rect.bottom
            ? pointer.current.y - rect.bottom
            : 0;

      if (distance < best) {
        best = distance;
        target = s;
      }
    }

    let index = 0;

    for (const href of target.items) {
      if (href === active.id) continue;

      const el = itemEls.current.get(href);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.top + rect.height / 2 < pointer.current.y) index++;
    }

    const fromSection = current.find((s) => s.items.includes(active.id));
    if (fromSection?.id === target.id && fromSection.items.indexOf(active.id) === index) return;

    setDraft(moveSidebarItem(current, active.id, target.id, index));
  }, []);

  // While dragging: follow the pointer, scroll near the edges, re-check the
  // drop position every frame (scrolling changes it without a pointer move).
  useEffect(() => {
    if (!drag || dropping) return;
    let frame = 0;
    const tick = () => {
      const root = rootRef.current;
      if (root) {
        const rect = root.getBoundingClientRect();
        const { y: pyNow } = pointer.current;
        if (pyNow < rect.top + EDGE) root.scrollTop -= Math.ceil((rect.top + EDGE - pyNow) / 6);
        else if (pyNow > rect.bottom - EDGE)
          root.scrollTop += Math.ceil((pyNow - (rect.bottom - EDGE)) / 6);
      }
      hitTest();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag, dropping, hitTest]);

  const begin = useCallback(
    (p: PendingDrag, clientX: number, clientY: number) => {
      const rect = p.el.getBoundingClientRect();
      const next = { kind: p.kind, id: p.id, width: rect.width, height: rect.height };
      pointer.current = { x: clientX, y: clientY };
      physics.pickUp(
        rect,
        { x: p.startX, y: p.startY },
        { x: clientX, y: clientY },
        { x: Math.min(28, rect.width / 3), y: rect.height / 2 },
      );
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
    const slot = () =>
      (active.kind === "item" ? itemEls : sectionEls).current
        .get(active.id)
        ?.getBoundingClientRect();
    setDropping(true);
    onChange(draftRef.current);

    // Aim the piece at its slot, let it settle, then swap the real row back in.
    void physics.drop(slot).then(() => {
      dragRef.current = null;
      setDrag(null);
      setDropping(false);
    });
  }, [onChange, physics]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const p = pending.current;
      if (p && e.pointerId === p.pointerId && !dragRef.current) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) >= START_THRESHOLD) {
          begin(p, e.clientX, e.clientY);
        }
        return;
      }
      if (!dragRef.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      physics.move(e.clientX, e.clientY);
    }
    function onUp(e: PointerEvent) {
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
  }, [begin, finish, dropping, physics]);

  function pointerDown(kind: DragKind, id: string) {
    return (e: React.PointerEvent<HTMLElement>) => {
      if (drag || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, button:not([data-drag-handle])")) return;
      // Touch drags only from the grip, so the rest of the list still scrolls.
      const fromHandle = !!target.closest("[data-drag-handle]");
      if (e.pointerType !== "mouse" && !fromHandle) return;
      const p: PendingDrag = {
        kind,
        id,
        el: e.currentTarget,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
      pending.current = p;
      if (e.pointerType !== "mouse") {
        e.preventDefault();
        begin(p, e.clientX, e.clientY);
      }
    };
  }

  function update(next: SidebarSection[]) {
    setDraft(next);
    onChange(next);
  }

  const list = editing ? draft : sections;
  const draggingSection = drag?.kind === "section";

  // The icon rail has no labels to group under — just the icons, in order.
  if (rail && !editing) {
    return (
      <SidebarGroup>
        <SidebarMenu>{list.flatMap((s) => s.items).map((href) => renderLink(href))}</SidebarMenu>
      </SidebarGroup>
    );
  }

  const ghostSection = drag?.kind === "section" ? list.find((s) => s.id === drag.id) : undefined;

  return (
    <div ref={rootRef} className="flex flex-col gap-1" data-vaul-no-drag={editing ? "" : undefined}>
      {list.map((section) => {
        const isCollapsed = !editing && collapsed.has(section.id);
        const label = sectionLabel(section);
        const isGhost = draggingSection && drag?.id === section.id;
        // A collapsed section still shows the page you're on.
        const visibleItems = isCollapsed ? section.items.filter(isActive) : section.items;
        if (!editing && section.items.length === 0) return null;

        return (
          <motion.div
            key={section.id}
            layout={editing ? "position" : false}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            ref={(el: HTMLDivElement | null) => {
              if (el) sectionEls.current.set(section.id, el);
              else sectionEls.current.delete(section.id);
            }}
            className="flex flex-col py-1"
          >
            {isGhost ? (
              <div className={cn("h-8 rounded-md", DROP_PREVIEW)} />
            ) : editing ? (
              <div
                onPointerDown={pointerDown("section", section.id)}
                className="group/section flex h-8 cursor-grab items-center gap-1 rounded-md pl-1 pr-0.5 hover:bg-sidebar-accent/60 active:cursor-grabbing"
              >
                <button
                  type="button"
                  data-drag-handle
                  aria-label={t("dragSection")}
                  className="grid size-7 shrink-0 touch-none place-items-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground"
                >
                  <GripVertical className="size-3.5" />
                </button>
                <input
                  defaultValue={label}
                  key={label}
                  autoFocus={section.id === focusId}
                  onFocus={(e) => {
                    if (section.id === focusId) {
                      e.currentTarget.select();
                      setFocusId(null);
                    }
                  }}
                  aria-label={t("sectionName")}
                  placeholder={t("sectionName")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const title = e.currentTarget.value.trim();
                    if (title === label) return;
                    update(
                      draftRef.current.map((s) =>
                        s.id === section.id ? { ...s, title: title || undefined } : s,
                      ),
                    );
                  }}
                  className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70 outline-none focus:bg-sidebar focus:ring-1 focus:ring-sidebar-ring"
                />
                {draft.length > 1 && (
                  <button
                    type="button"
                    aria-label={t("deleteSection")}
                    onClick={() => update(removeSidebarSection(draftRef.current, section.id))}
                    className="grid size-7 shrink-0 place-items-center rounded text-sidebar-foreground/40 opacity-100 transition-opacity hover:text-destructive md:opacity-0 md:group-hover/section:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onToggleSection(section.id)}
                aria-expanded={!isCollapsed}
                className="group/label flex items-center gap-1 rounded-md px-3 pb-1 pt-2 text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
              >
                <span className="truncate">{label}</span>
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform duration-200",
                    !isCollapsed && "rotate-90",
                    !isCollapsed && "opacity-0 group-hover/label:opacity-100",
                  )}
                />
              </button>
            )}

            {editing ? (
              !draggingSection && (
                <ul className="flex flex-col gap-0.5 pt-0.5">
                  {section.items.map((href) => {
                    const isDragged = drag?.kind === "item" && drag.id === href;
                    return (
                      <motion.li
                        key={href}
                        layoutId={`sidebar-edit-${href}`}
                        layout="position"
                        transition={{ type: "spring", stiffness: 520, damping: 38 }}
                        ref={(el: HTMLLIElement | null) => {
                          if (el) itemEls.current.set(href, el);
                          else itemEls.current.delete(href);
                        }}
                        onPointerDown={pointerDown("item", href)}
                        className="relative cursor-grab active:cursor-grabbing"
                      >
                        {isDragged ? (
                          <div className={cn("h-9 rounded-lg", DROP_PREVIEW)} />
                        ) : (
                          <RowVisual>
                            {renderItemContent(href)}
                            <span
                              data-drag-handle
                              className="-mr-1.5 ml-auto grid size-7 shrink-0 touch-none place-items-center text-sidebar-foreground/35"
                            >
                              <GripVertical className="size-3.5" />
                            </span>
                          </RowVisual>
                        )}
                      </motion.li>
                    );
                  })}
                  {section.items.length === 0 && (
                    <li className="grid h-9 place-items-center rounded-lg border border-dashed border-sidebar-border text-xs text-sidebar-foreground/45">
                      {t("dropHere")}
                    </li>
                  )}
                </ul>
              )
            ) : (
              <AnimatePresence initial={false}>
                {visibleItems.length > 0 && (
                  <motion.div
                    key={isCollapsed ? "active-only" : "all"}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <SidebarMenu>{visibleItems.map((href) => renderLink(href))}</SidebarMenu>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </motion.div>
        );
      })}

      {editing && !drag && (
        <button
          type="button"
          onClick={() => {
            const id = `custom-${Date.now().toString(36)}`;
            setFocusId(id);
            update([...draftRef.current, { id, title: t("newSectionTitle"), items: [] }]);
          }}
          className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-sidebar-border text-xs font-medium text-sidebar-foreground/60 transition-colors hover:border-sidebar-foreground/30 hover:text-sidebar-foreground"
        >
          <Plus className="size-3.5" />
          {t("newSection")}
        </button>
      )}

      {drag &&
        createPortal(
          <motion.div
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[100] origin-left rounded-lg"
            style={{
              ...physics.style,
              width: drag.width,
              height: drag.kind === "item" ? drag.height : undefined,
            }}
          >
            {drag.kind === "item" ? (
              <RowVisual lifted>
                {renderItemContent(drag.id)}
                <GripVertical className="ml-auto size-3.5 text-sidebar-foreground/35" />
              </RowVisual>
            ) : (
              ghostSection && (
                <div className="flex h-9 items-center gap-2 rounded-lg bg-sidebar px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground ring-1 ring-sidebar-border">
                  <GripVertical className="size-3.5 text-sidebar-foreground/40" />
                  <span className="truncate">{sectionLabel(ghostSection)}</span>
                  <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 text-[10px] tabular-nums">
                    {ghostSection.items.length}
                  </span>
                </div>
              )
            )}
          </motion.div>,
          document.body,
        )}
    </div>
  );
}
