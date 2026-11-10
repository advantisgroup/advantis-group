"use client";

import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  CookingPot,
  DoorOpen,
  Maximize2,
  Minus,
  Monitor,
  Pencil,
  QrCode,
  RotateCw,
  Ruler,
  Square,
  SquareSlash,
  Trash2,
  Type,
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
const NEW_BLOCK = { w: 100, h: 100 };
const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Room extends Box {
  id: string;
  name: string;
  open?: Side[];
  blocked?: boolean;
  labelX?: number;
  labelY?: number;
}
interface PlanLabel {
  id: string;
  text: string;
  x: number;
  y: number;
}
interface Line {
  id: string;
  kind: "wall" | "soft" | "door";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
type Target =
  | { type: "room"; id: string }
  | { type: "desk"; id: DeskId }
  | { type: "line"; id: string }
  | { type: "label"; id: string };
type DragMode = "move" | "resize" | "end1" | "end2" | "label";

function sideLine(room: Box, side: Side) {
  const right = room.x + room.w;
  const bottom = room.y + room.h;
  if (side === "top") return { x1: room.x, y1: room.y, x2: right, y2: room.y };
  if (side === "right") return { x1: right, y1: room.y, x2: right, y2: bottom };
  if (side === "bottom") return { x1: room.x, y1: bottom, x2: right, y2: bottom };
  return { x1: room.x, y1: room.y, x2: room.x, y2: bottom };
}

const NEW_LINE = { wall: 300, soft: 300, door: 90 };
const LINE_NAMES = {
  wall: "plan.addWall",
  soft: "plan.addSoftWall",
  door: "plan.addDoor",
} as const;
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
  const [labels, setLabels] = useState<PlanLabel[]>([]);
  const [deskDraft, setDeskDraft] = useState<Map<string, Box>>(new Map());
  const [selected, setSelected] = useState<Target | null>(null);
  const [nameDialog, setNameDialog] = useState<{
    kind: "room" | "label";
    id: string;
    name: string;
  } | null>(null);
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
    /** Where a dragged name started. */
    point?: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const canEdit = !!me?.canEdit;
  const openDesk = searchParams.get("platz") as DeskId | null;
  const layout = plan?.layout;
  const shownRooms = editing ? rooms : (layout?.rooms ?? []);
  const shownLines = editing ? lines : (layout?.lines ?? []);
  const shownLabels = editing ? labels : (layout?.labels ?? []);
  const desks = useMemo(
    () => (plan?.desks ?? []).map((desk) => ({ ...desk, ...deskDraft.get(desk._id) })),
    [plan?.desks, deskDraft],
  );

  if (!plan || !layout || !me) {
    return <Skeleton className="h-[60vh] w-full rounded-2xl" />;
  }

  const width = layout.width;
  const height = layout.height;
  const font = width / 36;
  const roomLabelAt = (room: Room) => ({
    x: room.labelX ?? room.x + font * 0.6,
    y: room.labelY ?? room.y + font * 1.3,
  });
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
    setLabels(layout!.labels);
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setSelected(null);
  }

  async function commitLayout(change: {
    rooms?: Room[];
    lines?: Line[];
    labels?: PlanLabel[];
    width?: number;
    height?: number;
  }) {
    const nextRooms = change.rooms ?? rooms;
    const nextLines = change.lines ?? lines;
    const nextLabels = change.labels ?? labels;
    setRooms(nextRooms);
    setLines(nextLines);
    setLabels(nextLabels);
    try {
      await saveLayout({
        width: change.width ?? width,
        height: change.height ?? height,
        rooms: nextRooms,
        lines: nextLines,
        labels: nextLabels,
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
    if (target.type === "label") {
      const label = labels.find((l) => l.id === target.id);
      return label && { x: label.x, y: label.y, w: 0, h: 0 };
    }
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
    const room = target.type === "room" ? rooms.find((r) => r.id === target.id) : undefined;
    const point =
      target.type === "label"
        ? { x: box.x, y: box.y }
        : mode === "label" && room
          ? roomLabelAt(room)
          : undefined;
    drag.current = {
      target,
      mode,
      start: toPlan(event),
      box: { ...box },
      line: line && { ...line },
      point,
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
    if (current.point) {
      const x = clamp(Math.round(current.point.x + dx), 0, width);
      const y = clamp(Math.round(current.point.y + dy), 0, height);
      const id = current.target.id;
      if (current.target.type === "label") {
        setLabels((prev) => prev.map((label) => (label.id === id ? { ...label, x, y } : label)));
      } else {
        setRooms((prev) =>
          prev.map((room) => (room.id === id ? { ...room, labelX: x, labelY: y } : room)),
        );
      }
      return;
    }
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
      const shiftX = next.x - box.x;
      const shiftY = next.y - box.y;
      // A name the admin placed moves with its room.
      setRooms((prev) =>
        prev.map((room) =>
          room.id === id
            ? {
                ...room,
                ...next,
                ...(room.labelX !== undefined && (box as Room).labelX !== undefined
                  ? {
                      labelX: (box as Room).labelX! + shiftX,
                      labelY: (box as Room).labelY! + shiftY,
                    }
                  : {}),
              }
            : room,
        ),
      );
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

  function addRoom(blocked = false) {
    const room: Room = {
      id: crypto.randomUUID().slice(0, 8),
      name: blocked ? "" : t("plan.newRoom"),
      ...centered(blocked ? NEW_BLOCK : NEW_ROOM),
      ...(blocked && { blocked: true }),
    };
    void commitLayout({ rooms: [...rooms, room] });
    setSelected({ type: "room", id: room.id });
    if (!blocked) setNameDialog({ kind: "room", id: room.id, name: room.name });
  }

  function addLabel() {
    const label = {
      id: crypto.randomUUID().slice(0, 8),
      text: t("plan.newLabel"),
      x: snap(width / 2),
      y: snap(height / 2),
    };
    void commitLayout({ labels: [...labels, label] });
    setSelected({ type: "label", id: label.id });
    setNameDialog({ kind: "label", id: label.id, name: label.text });
  }

  function toggleSide(roomId: string, side: Side) {
    void commitLayout({
      rooms: rooms.map((room) => {
        if (room.id !== roomId) return room;
        const open = new Set(room.open ?? []);
        if (open.has(side)) open.delete(side);
        else open.add(side);
        return { ...room, open: SIDES.filter((s) => open.has(s)) };
      }),
    });
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
    } else if (selected.type === "desk") {
      const id = selected.id;
      setDeskDraft((prev) => new Map(prev).set(id, turned));
      void commitDesk(id, turned);
    }
  }

  function editSelected() {
    if (!selected) return;
    if (selected.type === "room") {
      const room = rooms.find((r) => r.id === selected.id);
      if (room) setNameDialog({ kind: "room", id: room.id, name: room.name });
    } else if (selected.type === "label") {
      const label = labels.find((l) => l.id === selected.id);
      if (label) setNameDialog({ kind: "label", id: label.id, name: label.text });
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
    } else if (selected.type === "label") {
      void commitLayout({ labels: labels.filter((label) => label.id !== selected.id) });
      setSelected(null);
    } else {
      const desk = desks.find((d) => d._id === selected.id);
      if (desk) setRemoving({ id: desk._id, name: desk.name });
    }
  }

  const hasPlan =
    shownRooms.length > 0 || shownLines.length > 0 || shownLabels.length > 0 || desks.length > 0;
  const selectedRoom =
    selected?.type === "room" ? rooms.find((room) => room.id === selected.id) : undefined;
  const selectedName = !selected
    ? ""
    : selected.type === "room"
      ? selectedRoom?.blocked
        ? t("plan.addBlock")
        : (selectedRoom?.name ?? "")
      : selected.type === "label"
        ? (labels.find((l) => l.id === selected.id)?.text ?? "")
        : selected.type === "line"
          ? t(LINE_NAMES[lines.find((l) => l.id === selected.id)?.kind ?? "wall"])
          : (desks.find((d) => d._id === selected.id)?.name ?? "");

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-last lg:flex-1">
        {plan?.kitchen && (
          <div className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3">
            <CookingPot className="size-6 shrink-0 text-warn" aria-hidden />
            <p className="font-display text-lg font-bold leading-snug">
              {t("plan.kitchenBanner", {
                name: kitchenName(plan.kitchen, desks),
              })}
            </p>
          </div>
        )}
        <KpiStrip className="lg:grid-cols-2">
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
        {canEdit && !editing && (
          <div className="flex flex-wrap gap-2">
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
          </div>
        )}
        {canEdit && editing && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t("plan.edit")}</p>
              <Button size="sm" onClick={stopEditing}>
                <Check className="size-4" />
                {t("plan.done")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => addRoom()}>
                <Square className="size-4" />
                {t("plan.addRoom")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void addDesk()}>
                <Monitor className="size-4" />
                {t("plan.addDesk")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => addLine("wall")}>
                <Minus className="size-4" />
                {t("plan.addWall")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => addLine("soft")}>
                <Minus className="size-4 opacity-60" />
                {t("plan.addSoftWall")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => addLine("door")}>
                <DoorOpen className="size-4" />
                {t("plan.addDoor")}
              </Button>
              <Button size="sm" variant="outline" onClick={addLabel}>
                <Type className="size-4" />
                {t("plan.addLabel")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => addRoom(true)}>
                <SquareSlash className="size-4" />
                {t("plan.addBlock")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="col-span-2"
                onClick={() => setSizeOpen(true)}
              >
                <Ruler className="size-4" />
                {t("plan.size")}
              </Button>
            </div>
            {selected ? (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="truncate text-xs text-muted-foreground">
                  {t("plan.selection")}:{" "}
                  <span className="font-medium text-foreground">{selectedName}</span>
                </p>
                {selectedRoom && !selectedRoom.blocked && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{t("plan.walls")}</p>
                    <div className="grid grid-cols-4 gap-1">
                      {SIDES.map((side) => {
                        const hasWall = !selectedRoom.open?.includes(side);
                        return (
                          <Button
                            key={side}
                            size="sm"
                            variant={hasWall ? "default" : "outline"}
                            aria-pressed={hasWall}
                            onClick={() => toggleSide(selectedRoom.id, side)}
                          >
                            {t(`sides.${side}`)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {!(selected.type === "line" || selectedRoom?.blocked) && (
                    <Button size="sm" variant="ghost" onClick={editSelected}>
                      <Pencil className="size-4" />
                      {t("plan.rename")}
                    </Button>
                  )}
                  {selected.type !== "label" && (
                    <Button size="sm" variant="ghost" onClick={rotate}>
                      <RotateCw className="size-4" />
                      {t("plan.rotate")}
                    </Button>
                  )}
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
              </div>
            ) : (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                {t("plan.selectHint")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("plan.editHint")}</p>
          </div>
        )}
      </aside>
      <div className="max-w-full overflow-hidden rounded-2xl border border-border bg-card p-2 sm:p-4 lg:w-1/2 lg:shrink-0">
        {!hasPlan && !editing && (
          <p className="px-2 pb-3 text-sm text-muted-foreground">{t("plan.empty")}</p>
        )}
        <svg
          ref={svgRef}
          viewBox={`-10 -10 ${width + 20} ${height + 20}`}
          className={cn(
            // Desktop: the plan takes half the page width, the editors the other half.
            "block h-auto w-full select-none",
            editing && "touch-none",
          )}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={() => editing && setSelected(null)}
          role="img"
          aria-label={t("tabs.plan")}
        >
          <defs>
            {/* Same violet fade as the intranet's default profile pictures. */}
            <linearGradient id="office-face-fade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6d28d9" />
              <stop offset="100%" stopColor="#c4b5fd" />
            </linearGradient>
            <filter id="office-desk-shadow" x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx={0} dy={4} stdDeviation={5} floodOpacity={0.18} />
            </filter>
            <pattern id="office-grid" width={50} height={50} patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" className="fill-none stroke-border" strokeWidth={1} />
            </pattern>
          </defs>
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            rx={4}
            className="fill-muted/30 stroke-foreground/80"
            strokeWidth={10}
          />
          {editing && <rect x={0} y={0} width={width} height={height} fill="url(#office-grid)" />}

          {shownRooms.map((room) => {
            const isSelected = sameTarget(selected, { type: "room", id: room.id });
            const open = new Set(room.open ?? []);
            const at = roomLabelAt(room);
            return (
              <g key={room.id}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  className={cn(
                    room.blocked ? "fill-foreground/85" : "fill-background",
                    editing && "cursor-move",
                  )}
                  onPointerDown={(e) => onPointerDown(e, { type: "room", id: room.id }, "move")}
                />
                {!room.blocked &&
                  SIDES.filter((side) => !open.has(side)).map((side) => (
                    <line
                      key={side}
                      {...sideLine(room, side)}
                      className="pointer-events-none stroke-foreground/70"
                      strokeWidth={4}
                      strokeLinecap="square"
                    />
                  ))}
                {editing && isSelected && (
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    className="pointer-events-none fill-none stroke-primary"
                    strokeWidth={6}
                    strokeDasharray="14 8"
                  />
                )}
                {!room.blocked && room.name && (
                  <text
                    x={at.x}
                    y={at.y}
                    fontSize={font * 0.8}
                    className={cn(
                      "fill-muted-foreground font-semibold uppercase",
                      editing ? "cursor-move" : "pointer-events-none",
                      editing && isSelected && "fill-primary",
                    )}
                    letterSpacing={font * 0.04}
                    onPointerDown={(e) => onPointerDown(e, { type: "room", id: room.id }, "label")}
                  >
                    {room.name}
                  </text>
                )}
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
            .sort((a, b) => Number(a.kind === "door") - Number(b.kind === "door"))
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

          {shownLabels.map((label) => (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              fontSize={font * 0.8}
              textAnchor="middle"
              letterSpacing={font * 0.04}
              className={cn(
                "fill-muted-foreground font-semibold uppercase",
                editing ? "cursor-move" : "pointer-events-none",
                editing && sameTarget(selected, { type: "label", id: label.id }) && "fill-primary",
              )}
              onPointerDown={(e) => onPointerDown(e, { type: "label", id: label.id }, "move")}
            >
              {label.text}
            </text>
          ))}

          {desks.map((desk) => {
            const isSelected = sameTarget(selected, { type: "desk", id: desk._id });
            const isOpen = openDesk === desk._id;
            return (
              <g
                key={desk._id}
                className={cn("group", editing ? "cursor-move" : "cursor-pointer")}
                onPointerDown={(e) => onPointerDown(e, { type: "desk", id: desk._id }, "move")}
                onClick={() => !editing && setDesk(desk._id)}
                role={editing ? undefined : "button"}
                aria-label={desk.userName ?? t("plan.free")}
              >
                <DeskShape
                  desk={desk}
                  font={font}
                  highlighted={isSelected || isOpen}
                  interactive={!editing}
                  editing={editing}
                  freeLabel={t("plan.free")}
                  labels={{
                    in: t("plan.clockIn"),
                    break: t("plan.clockBreak"),
                    out: t("plan.clockOut"),
                    kitchen: t("plan.kitchen"),
                  }}
                />
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
          {editing ? (
            <>
              <Legend
                className="size-2.5 rounded-full border-ok bg-ok"
                label={t("plan.legendChecked")}
              />
              <Legend
                className="size-2.5 rounded-full border-warn bg-warn"
                label={t("plan.legendOpen")}
              />
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-destructive" />
                {t("plan.legendDefect")}
              </span>
            </>
          ) : (
            <>
              <Legend className="size-2.5 rounded-full border-ok bg-ok" label={t("plan.clockIn")} />
              <Legend
                className="size-2.5 rounded-full border-warn bg-warn"
                label={t("plan.clockBreak")}
              />
              <Legend
                className="size-2.5 rounded-full border-destructive bg-destructive"
                label={t("plan.clockOut")}
              />
              <span className="flex items-center gap-1.5">
                <CookingPot className="size-3.5" />
                {t("plan.kitchen")}
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-foreground/85" />
            {t("plan.legendBlocked")}
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
      <NameDialog
        target={nameDialog}
        onClose={() => setNameDialog(null)}
        onSave={(name) => {
          if (!nameDialog) return;
          const id = nameDialog.id;
          void commitLayout(
            nameDialog.kind === "room"
              ? { rooms: rooms.map((room) => (room.id === id ? { ...room, name } : room)) }
              : {
                  labels: labels.map((label) =>
                    label.id === id ? { ...label, text: name } : label,
                  ),
                },
          );
        }}
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
          ...labels.map((l) => l.x),
          ...desks.map((d) => d.x + d.w),
        )}
        minHeight={Math.max(
          0,
          ...rooms.map((r) => r.y + r.h),
          ...lines.map((l) => Math.max(l.y1, l.y2)),
          ...labels.map((l) => l.y),
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
      {line.kind !== "door" ? (
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          // A soft wall looks like a room wall: thin and a little lighter.
          className={
            selected ? "stroke-primary" : line.kind === "soft" ? "stroke-foreground/70" : ink
          }
          strokeWidth={line.kind === "soft" ? 4 : 10}
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

function NameDialog({
  target,
  onClose,
  onSave,
}: {
  target: { kind: "room" | "label"; id: string; name: string } | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("Office");
  const [name, setName] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  if (target && target.id !== forId) {
    setForId(target.id);
    setName(target.name);
  }
  const dialog = target?.kind === "label" ? "labelDialog" : "roomDialog";
  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title={t(`${dialog}.title`)}
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
        <Label htmlFor="office-room-name">{t(`${dialog}.name`)}</Label>
        <Input
          id="office-room-name"
          value={name}
          autoFocus
          placeholder={t(`${dialog}.placeholder`)}
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

/** Initials for people without a photo. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** The kitchen person as the plan shows them: call name from their desk, else first name. */
function kitchenName(
  kitchen: { userId: string; firstName: string | null },
  desks: { name: string; userId: string | null; userName: string | null }[],
) {
  const desk = desks.find((d) => d.userId === kitchen.userId && d.userName);
  return desk?.userName ? callName(desk.name, desk.userName) : (kitchen.firstName ?? "?");
}

/** Desks are numbered P1, P2 … on creation; anything else is a call name. */
const AUTO_NAME = /^p\d+$/i;

function callName(deskName: string, userName: string) {
  return AUTO_NAME.test(deskName.trim()) ? (userName.split(" ")[0] ?? userName) : deskName.trim();
}

/**
 * A desk as a little tabletop with the person in front: photo or initials,
 * and just the first name — or the desk's own name when someone typed a
 * call name there (e.g. „Alex“ for Alexandra). Wide desks put the face left of the name,
 * narrow ones above it. A dot in the corner shows the inventory status.
 */
function DeskShape({
  desk,
  font,
  highlighted,
  interactive,
  editing,
  freeLabel,
  labels,
}: {
  desk: {
    _id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    userName: string | null;
    userAvatar: string | null;
    checkedAt: number | null;
    defective: number;
    clock: "in" | "break" | "out" | null;
    kitchenToday: boolean;
  };
  font: number;
  highlighted: boolean;
  interactive: boolean;
  /** Inventory dots only while editing; otherwise the person's status. */
  editing: boolean;
  freeLabel: string;
  labels: { in: string; break: string; out: string; kitchen: string };
}) {
  const { x, y, w, h } = desk;
  const name = desk.userName;
  // No one sits here but the desk has its own name (e.g. „Meetingraum“): a
  // place for equipment, not a free desk.
  const spot = !name && !AUTO_NAME.test(desk.name.trim());
  const first = name ? callName(desk.name, name) : spot ? desk.name.trim() : freeLabel;
  const wide = w >= h * 1.4;
  const pad = Math.min(w, h) * 0.12;
  // Face: left of the name on wide desks, above it on narrow ones.
  const r = wide ? Math.min(h * 0.32, w * 0.16) : Math.min(w * 0.3, h * 0.2);
  const cx = wide ? x + pad + r : x + w / 2;
  const textX = wide ? cx + r + pad * 0.8 : x + w / 2;
  const room = wide ? x + w - pad * 1.4 - textX : w - pad * 2;
  // Bold display letters run about two thirds of the font size wide.
  const fit = (text: string, max: number, width: number) =>
    Math.min(max, room / Math.max(text.length * width, 1));
  const big = fit(
    first,
    wide ? Math.min(font * 0.75, h * 0.3) : Math.min(font * 0.6, h * 0.16),
    0.66,
  );
  const gap = pad * 0.6;
  // Narrow desks: face and name as one block, centred top to bottom.
  // Kitchen duty today: a small pot above the name.
  const pot = desk.kitchenToday ? big * 0.85 : 0;
  const block = r * 2 + gap + (pot ? pot + gap * 0.5 : 0) + big;
  const cy = wide ? y + h / 2 : y + Math.max((h - block) / 2, pad) + r;
  const nameY = wide
    ? cy + big * 0.35 + (pot ? pot * 0.45 : 0)
    : cy + r + gap + (pot ? pot + gap * 0.5 : 0) + big * 0.85;
  const potY = nameY - big * 0.85 - pot - gap * 0.3;
  const potX = wide ? textX : textX - pot / 2;
  const clip = `office-face-${desk._id}`;
  const dot = Math.max(Math.min(w, h) * 0.07, 5);

  return (
    <>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={Math.min(w, h) * 0.14}
        filter="url(#office-desk-shadow)"
        className={cn(
          "fill-card stroke-border transition-[fill,stroke]",
          interactive && "group-hover:fill-primary/10 group-hover:stroke-primary/60",
          highlighted && "stroke-primary",
        )}
        strokeWidth={highlighted ? 6 : 2}
      />
      {name ? (
        desk.userAvatar ? (
          <>
            <clipPath id={clip}>
              <circle cx={cx} cy={cy} r={r} />
            </clipPath>
            <image
              href={desk.userAvatar}
              x={cx - r}
              y={cy - r}
              width={r * 2}
              height={r * 2}
              clipPath={`url(#${clip})`}
              preserveAspectRatio="xMidYMid slice"
              className="pointer-events-none"
            />
          </>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={r} fill="url(#office-face-fade)" />
            <text
              x={cx}
              y={cy + r * 0.28}
              fontSize={r * 0.78}
              textAnchor="middle"
              className="pointer-events-none fill-white font-semibold"
            >
              {initials(name)}
            </text>
          </>
        )
      ) : spot ? (
        <>
          <circle cx={cx} cy={cy} r={r} className="fill-muted" />
          {/* A small screen on a stand. */}
          <rect
            x={cx - r * 0.5}
            y={cy - r * 0.42}
            width={r}
            height={r * 0.66}
            rx={r * 0.08}
            className="fill-none stroke-muted-foreground"
            strokeWidth={Math.max(r * 0.09, 1.5)}
          />
          <line
            x1={cx - r * 0.28}
            y1={cy + r * 0.48}
            x2={cx + r * 0.28}
            y2={cy + r * 0.48}
            className="stroke-muted-foreground"
            strokeWidth={Math.max(r * 0.09, 1.5)}
            strokeLinecap="round"
          />
        </>
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="fill-none stroke-muted-foreground/50"
          strokeWidth={2}
          strokeDasharray="6 5"
        />
      )}
      <text
        x={textX}
        y={nameY}
        fontSize={big}
        textAnchor={wide ? "start" : "middle"}
        className={cn(
          "pointer-events-none font-display font-bold",
          name ? "fill-foreground" : "fill-muted-foreground font-medium",
        )}
      >
        {first}
      </text>
      {pot > 0 && (
        <CookingPot
          x={potX}
          y={potY}
          width={pot}
          height={pot}
          className="pointer-events-none text-warn"
          aria-label={labels.kitchen}
        />
      )}
      {!editing &&
        desk.clock && (
          // Clock status sits on the face, lower right, and glows.
          <g className="pointer-events-none">
            <title>{labels[desk.clock]}</title>
            <circle
              cx={cx + r * 0.72}
              cy={cy + r * 0.72}
              r={r * 0.3}
              className={cn(
                "opacity-40",
                desk.clock === "in"
                  ? "fill-ok animate-pulse"
                  : desk.clock === "break"
                    ? "fill-warn"
                    : "fill-destructive",
              )}
            />
            <circle
              cx={cx + r * 0.72}
              cy={cy + r * 0.72}
              r={r * 0.2}
              className={cn(
                "stroke-card",
                desk.clock === "in"
                  ? "fill-ok"
                  : desk.clock === "break"
                    ? "fill-warn"
                    : "fill-destructive",
              )}
              strokeWidth={r * 0.06}
            />
          </g>
        )}
      {editing && (
        <>
          <circle
            cx={x + w - dot * 1.6}
            cy={y + dot * 1.6}
            r={dot}
            className={cn("pointer-events-none", desk.checkedAt ? "fill-ok" : "fill-warn")}
          />
          {desk.defective > 0 && (
            <circle
              cx={x + w - dot * 4}
              cy={y + dot * 1.6}
              r={dot}
              className="pointer-events-none fill-destructive"
            />
          )}
        </>
      )}
    </>
  );
}
