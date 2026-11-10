"use client";

import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  DoorOpen,
  Maximize2,
  Minus,
  Monitor,
  Pencil,
  QrCode,
  RotateCw,
  Ruler,
  Square,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { DeskPanel } from "./DeskPanel";
import { QrLabelsDialog } from "./QrLabels";
import { type DeskId } from "./shared";

const GRID = 10;
const NEW_DESK = { w: 160, h: 80 };
const NEW_ROOM = { w: 400, h: 300 };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Room extends Box {
  id: string;
  name: string;
}
interface Line {
  id: string;
  kind: "wall" | "door";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
type Target =
  | { type: "room"; id: string }
  | { type: "desk"; id: DeskId }
  | { type: "line"; id: string };
type DragMode = "move" | "resize" | "end1" | "end2";

const NEW_LINE = { wall: 300, door: 90 };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const snap = (value: number) => Math.round(value / GRID) * GRID;
const sameTarget = (a: Target | null, b: Target) => a?.type === b.type && a.id === b.id;

export function FloorPlan() {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const plan = useQuery(api.office.plan);
  const me = useQuery(api.office.me);
  const saveLayout = useMutation(api.office.saveLayout);
  const createDesk = useMutation(api.office.createDesk);
  const updateDesk = useMutation(api.office.updateDesk);
  const removeDesk = useMutation(api.office.removeDesk);

  const [editing, setEditing] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [deskDraft, setDeskDraft] = useState<Map<string, Box>>(new Map());
  const [selected, setSelected] = useState<Target | null>(null);
  const [roomDialog, setRoomDialog] = useState<Room | null>(null);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [removing, setRemoving] = useState<{ id: DeskId; name: string } | null>(null);
  const [qrDesks, setQrDesks] = useState<DeskId[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    target: Target;
    mode: DragMode;
    start: { x: number; y: number };
    box: Box;
    line?: Line;
    moved: boolean;
  } | null>(null);

  const canEdit = !!me?.canEdit;
  const openDesk = searchParams.get("platz") as DeskId | null;
  const layout = plan?.layout;
  const shownRooms = editing ? rooms : (layout?.rooms ?? []);
  const shownLines = editing ? lines : (layout?.lines ?? []);
  const desks = useMemo(
    () => (plan?.desks ?? []).map((desk) => ({ ...desk, ...deskDraft.get(desk._id) })),
    [plan?.desks, deskDraft],
  );

  if (!plan || !layout || !me) {
    return <Skeleton className="h-[60vh] w-full rounded-2xl" />;
  }

  const width = layout.width;
  const height = layout.height;
  // Sized to the width: the plan always spans the full width of the page.
  const font = width / 45;
  const checked = desks.filter((desk) => desk.checkedAt).length;
  const defective = desks.reduce((sum, desk) => sum + desk.defective, 0);

  function setDesk(id: DeskId | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("platz", id);
    else params.delete("platz");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function startEditing() {
    setRooms(layout!.rooms);
    setLines(layout!.lines);
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setSelected(null);
  }

  async function commitLayout(change: {
    rooms?: Room[];
    lines?: Line[];
    width?: number;
    height?: number;
  }) {
    const nextRooms = change.rooms ?? rooms;
    const nextLines = change.lines ?? lines;
    setRooms(nextRooms);
    setLines(nextLines);
    try {
      await saveLayout({
        width: change.width ?? width,
        height: change.height ?? height,
        rooms: nextRooms,
        lines: nextLines,
      });
    } catch (e) {
      handleError(e, t("plan.saveError"));
    }
  }

  async function commitDesk(id: DeskId, box: Box) {
    try {
      await updateDesk({ deskId: id, ...box });
    } catch (e) {
      handleError(e, t("plan.saveError"));
    } finally {
      setDeskDraft((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function boxOf(target: Target): Box | undefined {
    if (target.type === "room") return rooms.find((room) => room.id === target.id);
    if (target.type === "desk") return desks.find((desk) => desk._id === target.id);
    const line = lines.find((l) => l.id === target.id);
    return (
      line && {
        x: Math.min(line.x1, line.x2),
        y: Math.min(line.y1, line.y2),
        w: Math.abs(line.x2 - line.x1),
        h: Math.abs(line.y2 - line.y1),
      }
    );
  }

  function toPlan(event: ReactPointerEvent) {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: local.x, y: local.y };
  }

  function onPointerDown(event: ReactPointerEvent, target: Target, mode: DragMode) {
    if (!editing) return;
    event.stopPropagation();
    const box = boxOf(target);
    if (!box) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    setSelected(target);
    const line = target.type === "line" ? lines.find((l) => l.id === target.id) : undefined;
    drag.current = {
      target,
      mode,
      start: toPlan(event),
      box: { ...box },
      line: line && { ...line },
      moved: false,
    };
  }

  function draggedLine(
    line: Line,
    mode: DragMode,
    point: { x: number; y: number },
    dx: number,
    dy: number,
  ) {
    if (mode === "end1" || mode === "end2") {
      const x = clamp(snap(point.x), 0, width);
      const y = clamp(snap(point.y), 0, height);
      return mode === "end1" ? { ...line, x1: x, y1: y } : { ...line, x2: x, y2: y };
    }
    const mx = clamp(snap(dx), -Math.min(line.x1, line.x2), width - Math.max(line.x1, line.x2));
    const my = clamp(snap(dy), -Math.min(line.y1, line.y2), height - Math.max(line.y1, line.y2));
    return { ...line, x1: line.x1 + mx, y1: line.y1 + my, x2: line.x2 + mx, y2: line.y2 + my };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current) return;
    const point = toPlan(event);
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < GRID / 2) return;
    current.moved = true;
    if (current.line) {
      const next = draggedLine(current.line, current.mode, point, dx, dy);
      setLines((prev) => prev.map((line) => (line.id === next.id ? next : line)));
      return;
    }
    const { box } = current;
    const next =
      current.mode === "move"
        ? {
            ...box,
            x: Math.min(Math.max(snap(box.x + dx), 0), width - box.w),
            y: Math.min(Math.max(snap(box.y + dy), 0), height - box.h),
          }
        : {
            ...box,
            w: Math.min(Math.max(snap(box.w + dx), GRID * 3), width - box.x),
            h: Math.min(Math.max(snap(box.h + dy), GRID * 3), height - box.y),
          };
    if (current.target.type === "room") {
      const id = current.target.id;
      setRooms((prev) => prev.map((room) => (room.id === id ? { ...room, ...next } : room)));
    } else {
      const id = current.target.id;
      setDeskDraft((prev) => new Map(prev).set(id, next));
    }
  }

  function onPointerUp() {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    const box = boxOf(current.target);
    if (!box) return;
    if (current.target.type !== "desk") void commitLayout({});
    else void commitDesk(current.target.id, { x: box.x, y: box.y, w: box.w, h: box.h });
  }

  function centered(size: { w: number; h: number }) {
    return {
      x: snap(Math.max(0, (width - size.w) / 2)),
      y: snap(Math.max(0, (height - size.h) / 2)),
      w: Math.min(size.w, width),
      h: Math.min(size.h, height),
    };
  }

  function addRoom() {
    const room = {
      id: crypto.randomUUID().slice(0, 8),
      name: t("plan.newRoom"),
      ...centered(NEW_ROOM),
    };
    void commitLayout({ rooms: [...rooms, room] });
    setSelected({ type: "room", id: room.id });
    setRoomDialog(room);
  }

  function addLine(kind: Line["kind"]) {
    const length = Math.min(NEW_LINE[kind], width);
    const x1 = snap(Math.max(0, (width - length) / 2));
    const y = snap(height / 2);
    const line = { id: crypto.randomUUID().slice(0, 8), kind, x1, y1: y, x2: x1 + length, y2: y };
    void commitLayout({ lines: [...lines, line] });
    setSelected({ type: "line", id: line.id });
  }

  async function addDesk() {
    const taken = new Set(desks.map((desk) => desk.name));
    let n = desks.length + 1;
    while (taken.has(`P${n}`)) n++;
    try {
      const id = await createDesk({ name: `P${n}`, ...centered(NEW_DESK) });
      setSelected({ type: "desk", id });
    } catch (e) {
      handleError(e, t("plan.saveError"));
    }
  }

  function rotate() {
    if (!selected) return;
    if (selected.type === "line") {
      const line = lines.find((l) => l.id === selected.id);
      if (!line) return;
      // A quarter turn around the middle; for a door that also swaps the side it opens to.
      const cx = (line.x1 + line.x2) / 2;
      const cy = (line.y1 + line.y2) / 2;
      const hx = (line.x2 - line.x1) / 2;
      const hy = (line.y2 - line.y1) / 2;
      const turned = {
        ...line,
        x1: clamp(snap(cx + hy), 0, width),
        y1: clamp(snap(cy - hx), 0, height),
        x2: clamp(snap(cx - hy), 0, width),
        y2: clamp(snap(cy + hx), 0, height),
      };
      void commitLayout({ lines: lines.map((l) => (l.id === line.id ? turned : l)) });
      return;
    }
    const box = boxOf(selected);
    if (!box) return;
    const turned = {
      x: box.x,
      y: box.y,
      w: Math.min(box.h, width - box.x),
      h: Math.min(box.w, height - box.y),
    };
    if (selected.type === "room") {
      void commitLayout({
        rooms: rooms.map((room) => (room.id === selected.id ? { ...room, ...turned } : room)),
      });
    } else {
      const id = selected.id;
      setDeskDraft((prev) => new Map(prev).set(id, turned));
      void commitDesk(id, turned);
    }
  }

  function editSelected() {
    if (!selected) return;
    if (selected.type === "room") {
      const room = rooms.find((r) => r.id === selected.id);
      if (room) setRoomDialog(room);
    } else if (selected.type === "desk") {
      setDesk(selected.id);
    }
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.type === "room") {
      void commitLayout({ rooms: rooms.filter((room) => room.id !== selected.id) });
      setSelected(null);
    } else if (selected.type === "line") {
      void commitLayout({ lines: lines.filter((line) => line.id !== selected.id) });
      setSelected(null);
    } else {
      const desk = desks.find((d) => d._id === selected.id);
      if (desk) setRemoving({ id: desk._id, name: desk.name });
    }
  }

  const hasPlan = shownRooms.length > 0 || shownLines.length > 0 || desks.length > 0;

  return (
    <div className="space-y-4">
      <aside className="space-y-3">
        <KpiStrip>
          <Kpi label={t("kpi.desks")} value={desks.length} />
          <Kpi
            label={t("kpi.checked")}
            value={`${checked} / ${desks.length}`}
            tone={desks.length && checked < desks.length ? "warn" : "neutral"}
          />
          <Kpi label={t("kpi.inStorage")} value={plan.inStorage} href="/office/lager" />
          <Kpi
            label={t("kpi.defective")}
            value={defective}
            tone={defective ? "critical" : "neutral"}
          />
        </KpiStrip>
        {canEdit && (
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur">
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={addRoom}>
                  <Square className="size-4" />
                  {t("plan.addRoom")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => addLine("wall")}>
                  <Minus className="size-4" />
                  {t("plan.addWall")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => addLine("door")}>
                  <DoorOpen className="size-4" />
                  {t("plan.addDoor")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void addDesk()}>
                  <Monitor className="size-4" />
                  {t("plan.addDesk")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSizeOpen(true)}>
                  <Ruler className="size-4" />
                  {t("plan.size")}
                </Button>
                {selected && (
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                    {selected.type !== "line" && (
                      <Button size="sm" variant="ghost" onClick={editSelected}>
                        <Pencil className="size-4" />
                        {t("plan.rename")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={rotate}>
                      <RotateCw className="size-4" />
                      {t("plan.rotate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={deleteSelected}
                    >
                      <Trash2 className="size-4" />
                      {t("plan.delete")}
                    </Button>
                  </div>
                )}
                <Button size="sm" onClick={stopEditing}>
                  <Check className="size-4" />
                  {t("plan.done")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <Maximize2 className="size-4" />
                  {t("plan.edit")}
                </Button>
                {desks.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQrDesks(desks.map((d) => d._id))}
                  >
                    <QrCode className="size-4" />
                    {t("plan.printQr")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        {editing && <p className="text-xs text-muted-foreground">{t("plan.editHint")}</p>}
      </aside>
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 sm:p-4">
        {!hasPlan && !editing && (
          <p className="px-2 pb-3 text-sm text-muted-foreground">{t("plan.empty")}</p>
        )}
        <svg
          ref={svgRef}
          viewBox={`-10 -10 ${width + 20} ${height + 20}`}
          className={cn("block h-auto w-full select-none", editing && "touch-none")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={() => editing && setSelected(null)}
          role="img"
          aria-label={t("tabs.plan")}
        >
          <defs>
            <pattern id="office-grid" width={50} height={50} patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" className="fill-none stroke-border" strokeWidth={1} />
            </pattern>
          </defs>
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            className="fill-background stroke-foreground"
            strokeWidth={6}
          />
          {editing && <rect x={0} y={0} width={width} height={height} fill="url(#office-grid)" />}

          {shownRooms.map((room) => {
            const isSelected = sameTarget(selected, { type: "room", id: room.id });
            return (
              <g key={room.id}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  className={cn(
                    "fill-muted/40 stroke-foreground/70",
                    editing && "cursor-move",
                    isSelected && "stroke-primary",
                  )}
                  strokeWidth={isSelected ? 6 : 4}
                  onPointerDown={(e) => onPointerDown(e, { type: "room", id: room.id }, "move")}
                />
                <text
                  x={room.x + font * 0.6}
                  y={room.y + font * 1.3}
                  fontSize={font * 0.9}
                  className="pointer-events-none fill-muted-foreground font-semibold uppercase"
                  letterSpacing={font * 0.05}
                >
                  {room.name}
                </text>
                {editing && isSelected && (
                  <ResizeHandle
                    box={room}
                    size={font}
                    onPointerDown={(e) => onPointerDown(e, { type: "room", id: room.id }, "resize")}
                  />
                )}
              </g>
            );
          })}

          {[...shownLines]
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "wall" ? -1 : 1))
            .map((line) => (
              <PlanLine
                key={line.id}
                line={line}
                editing={editing}
                selected={sameTarget(selected, { type: "line", id: line.id })}
                handle={font * 0.45}
                onPointerDown={(e, mode) => onPointerDown(e, { type: "line", id: line.id }, mode)}
              />
            ))}

          {desks.map((desk) => {
            const isSelected = sameTarget(selected, { type: "desk", id: desk._id });
            const isOpen = openDesk === desk._id;
            const size = Math.min(font, desk.h / 2.6, desk.w / 4);
            return (
              <g
                key={desk._id}
                className={cn(editing ? "cursor-move" : "cursor-pointer")}
                onPointerDown={(e) => onPointerDown(e, { type: "desk", id: desk._id }, "move")}
                onClick={() => !editing && setDesk(desk._id)}
                role={editing ? undefined : "button"}
                aria-label={desk.userName ? `${desk.name} · ${desk.userName}` : desk.name}
              >
                <rect
                  x={desk.x}
                  y={desk.y}
                  width={desk.w}
                  height={desk.h}
                  rx={6}
                  className={cn(
                    desk.checkedAt ? "fill-ok/15 stroke-ok" : "fill-warn/10 stroke-warn",
                    (isSelected || isOpen) && "stroke-primary",
                    !editing && "transition-[fill] hover:fill-primary/15",
                  )}
                  strokeWidth={isSelected || isOpen ? 6 : 3}
                  strokeDasharray={desk.checkedAt ? undefined : "10 6"}
                />
                <text
                  x={desk.x + desk.w / 2}
                  y={desk.y + desk.h / 2 - (desk.userName ? size * 0.25 : -size * 0.35)}
                  fontSize={size}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground font-bold"
                >
                  {desk.name}
                </text>
                <text
                  x={desk.x + desk.w / 2}
                  y={desk.y + desk.h / 2 + size * 0.95}
                  fontSize={size * 0.72}
                  textAnchor="middle"
                  className="pointer-events-none fill-muted-foreground"
                >
                  {desk.userName ? desk.userName.split(" ")[0] : ""}
                </text>
                {desk.defective > 0 && (
                  <circle
                    cx={desk.x + desk.w - size * 0.5}
                    cy={desk.y + size * 0.5}
                    r={size * 0.28}
                    className="pointer-events-none fill-destructive"
                  />
                )}
                {editing && isSelected && (
                  <ResizeHandle
                    box={desk}
                    size={font}
                    onPointerDown={(e) =>
                      onPointerDown(e, { type: "desk", id: desk._id }, "resize")
                    }
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-3 text-xs text-muted-foreground">
          <Legend className="border-ok bg-ok/15" label={t("plan.legendChecked")} />
          <Legend className="border-dashed border-warn bg-warn/10" label={t("plan.legendOpen")} />
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive" />
            {t("plan.legendDefect")}
          </span>
          <span className="ml-auto tabular-nums">
            {(width / 100).toLocaleString("de-DE")} × {(height / 100).toLocaleString("de-DE")} m
          </span>
        </div>
      </div>

      <DeskPanel
        deskId={openDesk && desks.some((desk) => desk._id === openDesk) ? openDesk : null}
        onClose={() => setDesk(null)}
        canEdit={canEdit}
        desks={desks}
        people={plan.people}
        onPrintQr={(id) => setQrDesks([id])}
      />
      <QrLabelsDialog
        desks={qrDesks ? desks.filter((desk) => qrDesks.includes(desk._id)) : null}
        onClose={() => setQrDesks(null)}
      />
      <RoomDialog
        room={roomDialog}
        onClose={() => setRoomDialog(null)}
        onSave={(name) =>
          void commitLayout({
            rooms: rooms.map((room) => (room.id === roomDialog?.id ? { ...room, name } : room)),
          })
        }
      />
      <SizeDialog
        open={sizeOpen}
        onOpenChange={setSizeOpen}
        width={width}
        height={height}
        minWidth={Math.max(
          0,
          ...rooms.map((r) => r.x + r.w),
          ...lines.map((l) => Math.max(l.x1, l.x2)),
          ...desks.map((d) => d.x + d.w),
        )}
        minHeight={Math.max(
          0,
          ...rooms.map((r) => r.y + r.h),
          ...lines.map((l) => Math.max(l.y1, l.y2)),
          ...desks.map((d) => d.y + d.h),
        )}
        onSave={(size) => void commitLayout(size)}
      />
      <ResponsiveDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("removeDesk.title")}
        description={removing ? t("removeDesk.description", { name: removing.name }) : undefined}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                setSelected(null);
                if (target)
                  void removeDesk({ deskId: target.id }).catch((e) => handleError(e, t("error")));
              }}
            >
              {t("plan.delete")}
            </Button>
          </div>
        }
      >
        {null}
      </ResponsiveDialog>
    </div>
  );
}

/** A wall is a thick black line; a door is an opening in whatever it sits on,
 *  with its leaf and swing drawn the way floor plans do. */
function PlanLine({
  line,
  editing,
  selected,
  handle,
  onPointerDown,
}: {
  line: Line;
  editing: boolean;
  selected: boolean;
  handle: number;
  onPointerDown: (event: ReactPointerEvent, mode: DragMode) => void;
}) {
  const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1) || 1;
  const ux = (line.x2 - line.x1) / length;
  const uy = (line.y2 - line.y1) / length;
  const leafX = line.x1 + uy * length;
  const leafY = line.y1 - ux * length;
  const ink = selected ? "stroke-primary" : "stroke-foreground";
  return (
    <g className={cn(editing && "cursor-move")}>
      {line.kind === "wall" ? (
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className={ink}
          strokeWidth={10}
          strokeLinecap="square"
        />
      ) : (
        <>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className="stroke-background"
            strokeWidth={14}
          />
          <line x1={line.x1} y1={line.y1} x2={leafX} y2={leafY} className={ink} strokeWidth={4} />
          <path
            d={`M ${line.x2} ${line.y2} A ${length} ${length} 0 0 0 ${leafX} ${leafY}`}
            className={cn("fill-none", ink)}
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </>
      )}
      {editing && (
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="transparent"
          strokeWidth={40}
          onPointerDown={(e) => onPointerDown(e, "move")}
        />
      )}
      {editing && selected && (
        <>
          <circle
            cx={line.x1}
            cy={line.y1}
            r={handle}
            className="cursor-crosshair fill-primary stroke-background"
            strokeWidth={2}
            onPointerDown={(e) => onPointerDown(e, "end1")}
          />
          <circle
            cx={line.x2}
            cy={line.y2}
            r={handle}
            className="cursor-crosshair fill-primary stroke-background"
            strokeWidth={2}
            onPointerDown={(e) => onPointerDown(e, "end2")}
          />
        </>
      )}
    </g>
  );
}

function ResizeHandle({
  box,
  size,
  onPointerDown,
}: {
  box: Box;
  size: number;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const s = size * 1.1;
  return (
    <rect
      x={box.x + box.w - s / 2}
      y={box.y + box.h - s / 2}
      width={s}
      height={s}
      rx={3}
      className="cursor-nwse-resize fill-primary stroke-background"
      strokeWidth={2}
      onPointerDown={onPointerDown}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-4 rounded-sm border-2", className)} />
      {label}
    </span>
  );
}

function RoomDialog({
  room,
  onClose,
  onSave,
}: {
  room: Room | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("Office");
  const [name, setName] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  if (room && room.id !== forId) {
    setForId(room.id);
    setName(room.name);
  }
  return (
    <ResponsiveDialog
      open={!!room}
      onOpenChange={(open) => !open && onClose()}
      title={t("roomDialog.title")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(name.trim());
              onClose();
            }}
          >
            {t("save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="office-room-name">{t("roomDialog.name")}</Label>
        <Input
          id="office-room-name"
          value={name}
          autoFocus
          placeholder={t("roomDialog.placeholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </ResponsiveDialog>
  );
}

function SizeDialog({
  open,
  onOpenChange,
  width,
  height,
  minWidth,
  minHeight,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  onSave: (size: { width: number; height: number }) => void;
}) {
  const t = useTranslations("Office");
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setW(String(width));
      setH(String(height));
    }
  }
  const nextW = Number(w);
  const nextH = Number(h);
  const valid =
    Number.isInteger(nextW) &&
    Number.isInteger(nextH) &&
    nextW >= Math.max(100, minWidth) &&
    nextH >= Math.max(100, minHeight) &&
    nextW <= 10_000 &&
    nextH <= 10_000;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("sizeDialog.title")}
      description={t("sizeDialog.description")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave({ width: nextW, height: nextH });
              onOpenChange(false);
            }}
          >
            {t("save")}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="office-width">{t("sizeDialog.width")}</Label>
          <Input
            id="office-width"
            inputMode="numeric"
            value={w}
            onChange={(e) => setW(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="office-height">{t("sizeDialog.height")}</Label>
          <Input
            id="office-height"
            inputMode="numeric"
            value={h}
            onChange={(e) => setH(e.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
