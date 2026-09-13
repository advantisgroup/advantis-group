"use client";

import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Crown, GripVertical, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OrgPersonMenu, type OrgUnits } from "./OrgPersonMenu";
import { OrgStructureBar } from "./OrgStructureBar";
import { type Person, type PersonStatus } from "./person-status";
import { StatusPill } from "./StatusPill";

const ROOT = "root";
/** How far a finger or mouse has to move before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 6;
const EDGE_SCROLL_PX = 64;

interface DragState {
  canEdit: boolean;
  dragging: Id<"users"> | null;
  over: string | null;
  startDrag: (event: ReactPointerEvent, personId: Id<"users">) => void;
  units: OrgUnits | null;
}

const DragContext = createContext<DragState | null>(null);

function OrgNode({
  person,
  reportsOf,
  statuses,
  depth,
  onOpenProfile,
}: {
  person: Person;
  reportsOf: Map<string, Person[]>;
  statuses: Map<string, PersonStatus>;
  depth: number;
  onOpenProfile: (id: Id<"users">) => void;
}) {
  const t = useTranslations("Directory");
  const drag = useContext(DragContext);
  const reports = reportsOf.get(person._id) ?? [];
  const [open, setOpen] = useState(depth < 2);
  const status = statuses.get(person._id);
  const leads = [
    ...(drag?.units?.departments ?? []).filter((d) => d.reportsToUserId === person._id),
    ...(drag?.units?.teams ?? []).filter((team) => team.reportsToUserId === person._id),
  ].map((unit) => unit.name);

  return (
    <li>
      <div
        data-org-drop={person._id}
        className={cn(
          "flex items-center gap-1 rounded-lg py-1 transition-colors",
          drag?.over === person._id && "bg-accent ring-1 ring-foreground/20",
        )}
      >
        {drag?.canEdit && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t("orgDragHandle", { name: person.name })}
            onPointerDown={(event) => drag.startDrag(event, person._id)}
            className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
        )}
        {reports.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(open ? "orgCollapse" : "orgExpand", { name: person.name })}
            onClick={() => setOpen((o) => !o)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <button
          type="button"
          data-shortcut-item
          onClick={() => onOpenProfile(person._id)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            drag?.dragging === person._id && "opacity-50",
          )}
        >
          <Avatar className="size-8 shrink-0">
            {person.avatar && <AvatarImage src={person.avatar} alt="" />}
            <AvatarFallback className="text-xs">
              {initials(person.name, person.email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
              <span className="truncate">{person.name}</span>
              {person.managingDirector && (
                <Crown className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {[person.jobTitle, person.department].filter(Boolean).join(" · ")}
            </span>
            {leads.length > 0 && (
              <span className="mt-0.5 block truncate text-xs leading-tight text-foreground/80">
                {t("orgLeads", { names: leads.join(", ") })}
              </span>
            )}
          </span>
          {reports.length > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("orgReports", { count: reports.length })}
            </span>
          )}
          {status && status.kind !== "away" && (
            <StatusPill status={status} className="hidden shrink-0 sm:inline-flex" />
          )}
        </button>
        {drag?.units && (drag.units.canAdmin || drag.units.canSetDepartment) && (
          <OrgPersonMenu person={person} units={drag.units} />
        )}
      </div>
      {open && reports.length > 0 && (
        <ul className="ml-3 border-l border-border/70 pl-3">
          {reports.map((report) => (
            <OrgNode
              key={report._id}
              person={report}
              reportsOf={reportsOf}
              statuses={statuses}
              depth={depth + 1}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface Offer {
  person: Person;
  manager: Person;
  teams: { _id: Id<"teams">; name: string }[];
  departments: { _id: Id<"departments">; name: string }[];
}

function MembershipOffer({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const t = useTranslations("Directory");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const addToTeam = useMutation(api.orgData.addUserToTeam);
  const setDepartment = useMutation(api.orgData.setUserDepartment);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const options = offer
    ? [
        ...offer.teams.map((team) => ({
          key: team._id,
          label: t("orgOfferTeam", { name: team.name }),
          apply: () => addToTeam({ userId: offer.person._id, teamId: team._id }),
        })),
        ...offer.departments.map((department) => ({
          key: department._id,
          label: t("orgOfferDepartment", { name: department.name }),
          apply: () => setDepartment({ userId: offer.person._id, departmentId: department._id }),
        })),
      ]
    : [];

  async function apply() {
    setBusy(true);
    try {
      for (const option of options) if (picked.has(option.key)) await option.apply();
      toast.success(t("orgOfferApplied"));
      onClose();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={offer !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("orgOfferTitle", { name: offer?.manager.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {t("orgOfferDescription", {
              person: offer?.person.name ?? "",
              manager: offer?.manager.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1">
          {options.map((option) => (
            <li key={option.key}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/60">
                <Checkbox
                  checked={picked.has(option.key)}
                  onCheckedChange={(checked) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(option.key);
                      else next.delete(option.key);
                      return next;
                    })
                  }
                />
                {option.label}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("orgOfferSkip")}
          </Button>
          <Button disabled={busy || picked.size === 0} onClick={() => void apply()}>
            {tc("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrgChart({
  people,
  statuses,
  canEdit = false,
  canSetDepartment = false,
  onOpenProfile,
}: {
  people: Person[];
  statuses: Map<string, PersonStatus>;
  /** Admins can drag someone onto another person to change who they report to. */
  canEdit?: boolean;
  canSetDepartment?: boolean;
  onOpenProfile: (id: Id<"users">) => void;
}) {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const setManager = useMutation(api.users.setManager);
  const teams = useQuery(api.orgData.listTeams, {});
  const departments = useQuery(api.orgData.listDepartments, {});
  const units: OrgUnits | null =
    teams && departments ? { teams, departments, canAdmin: canEdit, canSetDepartment } : null;
  const [dragging, setDragging] = useState<Id<"users"> | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const press = useRef<{ id: Id<"users">; x: number; y: number; active: boolean } | null>(null);

  const { roots, reportsOf, unplaced } = useMemo(() => {
    const ids = new Set(people.map((p) => p._id as string));
    const reportsOf = new Map<string, Person[]>();
    const roots: Person[] = [];
    const unplaced: Person[] = [];
    for (const person of people) {
      const managerId = person.managerId as string | undefined;
      if (managerId && ids.has(managerId) && managerId !== person._id) {
        reportsOf.set(managerId, [...(reportsOf.get(managerId) ?? []), person]);
      } else if (people.some((p) => p.managerId === person._id)) {
        roots.push(person);
      } else {
        unplaced.push(person);
      }
    }
    const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
    for (const list of reportsOf.values()) list.sort(byName);
    return { roots: roots.sort(byName), reportsOf, unplaced: unplaced.sort(byName) };
  }, [people]);

  const directors = useMemo(() => people.filter((p) => p.managingDirector), [people]);

  /** Themselves and everyone below them — dropping there would make a loop. */
  function blockedFor(personId: string) {
    const out = new Set<string>();
    const stack = [personId];
    while (stack.length) {
      const id = stack.pop()!;
      out.add(id);
      for (const report of reportsOf.get(id) ?? []) stack.push(report._id);
    }
    return out;
  }

  function targetAt(x: number, y: number, blocked: Set<string>): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-org-drop]");
    const id = el?.dataset.orgDrop ?? null;
    return id && !blocked.has(id) ? id : null;
  }

  // Pointer events rather than HTML drag and drop, which touch screens don't fire.
  function startDrag(event: ReactPointerEvent, personId: Id<"users">) {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    press.current = { id: personId, x: event.clientX, y: event.clientY, active: false };
    const blocked = blockedFor(personId);

    const move = (e: PointerEvent) => {
      const current = press.current;
      if (!current) return;
      if (!current.active) {
        if (Math.hypot(e.clientX - current.x, e.clientY - current.y) < DRAG_THRESHOLD_PX) return;
        current.active = true;
        setDragging(current.id);
      }
      e.preventDefault();
      setGhost({ x: e.clientX, y: e.clientY });
      setOver(targetAt(e.clientX, e.clientY, blocked));
      if (e.clientY < EDGE_SCROLL_PX) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, 12);
    };
    const end = (e: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      const current = press.current;
      press.current = null;
      const target = e.type === "pointerup" ? targetAt(e.clientX, e.clientY, blocked) : null;
      setDragging(null);
      setOver(null);
      setGhost(null);
      if (current?.active && target) {
        onDrop(current.id, target === ROOT ? null : (target as Id<"users">));
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function onDrop(personId: Id<"users">, managerId: Id<"users"> | null) {
    const person = people.find((p) => p._id === personId);
    const manager = managerId ? people.find((p) => p._id === managerId) : undefined;
    if (!person || person.managerId === managerId) return;
    setManager({ userId: personId, managerId: managerId ?? undefined })
      .then(() => {
        toast.success(
          manager
            ? t("orgMoved", { person: person.name, manager: manager.name })
            : t("orgMovedTop", { person: person.name }),
        );
        if (!manager) return;
        const ledTeams = (teams ?? []).filter(
          (team) => team.reportsToUserId === manager._id && !person.teams.includes(team.slug),
        );
        const ledDepartments = (departments ?? []).filter(
          (department) =>
            department.reportsToUserId === manager._id &&
            department.name.trim().toLowerCase() !== (person.department ?? "").trim().toLowerCase(),
        );
        if (ledTeams.length || ledDepartments.length) {
          setOffer({ person, manager, teams: ledTeams, departments: ledDepartments });
        }
      })
      .catch(handleError);
  }

  const draggedPerson = dragging ? people.find((p) => p._id === dragging) : undefined;

  return (
    <DragContext.Provider value={{ canEdit, dragging, over, startDrag, units }}>
      <div className={cn("space-y-6", dragging && "select-none")}>
        {directors.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Crown className="size-3.5" />
              {t("orgManagement")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {directors.map((person) => (
                <button
                  key={person._id}
                  type="button"
                  onClick={() => onOpenProfile(person._id)}
                  className="flex items-center gap-2 rounded-full border border-border/70 bg-card py-1 pl-1 pr-3 text-sm transition-colors hover:bg-accent/60"
                >
                  <Avatar className="size-6">
                    {person.avatar && <AvatarImage src={person.avatar} alt="" />}
                    <AvatarFallback className="text-[10px]">
                      {initials(person.name, person.email)}
                    </AvatarFallback>
                  </Avatar>
                  {person.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {canEdit && dragging && (
          <div
            data-org-drop={ROOT}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors",
              over === ROOT && "border-foreground/40 bg-accent text-foreground",
            )}
          >
            <UserX className="size-4" />
            {t("orgDropNoManager")}
          </div>
        )}
        {canEdit && !dragging && (
          <div className="space-y-2">
            {units && <OrgStructureBar units={units} />}
            <p className="text-xs text-muted-foreground">{t("orgDragHint")}</p>
          </div>
        )}
        {roots.length > 0 && (
          <ul className="rounded-xl border border-border/70 bg-card p-2">
            {roots.map((person) => (
              <OrgNode
                key={person._id}
                person={person}
                reportsOf={reportsOf}
                statuses={statuses}
                depth={0}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </ul>
        )}
        {unplaced.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">
              {t("orgUnplaced", { count: unplaced.length })}
            </h2>
            <ul className="rounded-xl border border-border/70 bg-card p-2">
              {unplaced.map((person) => (
                <OrgNode
                  key={person._id}
                  person={person}
                  reportsOf={reportsOf}
                  statuses={statuses}
                  depth={0}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
      {ghost && draggedPerson && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-full border border-border/70 bg-popover px-3 py-1.5 text-sm font-medium shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {draggedPerson.name}
        </div>
      )}
      <MembershipOffer key={offer?.person._id} offer={offer} onClose={() => setOffer(null)} />
    </DragContext.Provider>
  );
}
