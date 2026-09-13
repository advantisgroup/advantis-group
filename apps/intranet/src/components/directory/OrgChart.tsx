"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, GripVertical, UserX } from "lucide-react";
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

import { type Person, type PersonStatus } from "./person-status";
import { StatusPill } from "./StatusPill";

const DRAG_TYPE = "text/org-person";

interface DragState {
  canEdit: boolean;
  dragging: Id<"users"> | null;
  setDragging: (id: Id<"users"> | null) => void;
  /** People the dragged person may not land on: themselves and everyone below them. */
  blocked: Set<string>;
  onDropOn: (managerId: Id<"users"> | null) => void;
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
  const [over, setOver] = useState(false);
  const status = statuses.get(person._id);
  const canDrop = !!drag?.dragging && !drag.blocked.has(person._id);

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-lg py-1 transition-colors",
          over && canDrop && "bg-accent ring-1 ring-foreground/20",
        )}
        onDragOver={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (canDrop) drag!.onDropOn(person._id);
        }}
      >
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
          draggable={drag?.canEdit}
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_TYPE, person._id);
            event.dataTransfer.effectAllowed = "move";
            // changing the layout inside dragstart cancels the drag in Chrome
            setTimeout(() => drag?.setDragging(person._id));
          }}
          onDragEnd={() => drag?.setDragging(null)}
          onClick={() => onOpenProfile(person._id)}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            drag?.dragging === person._id && "opacity-50",
          )}
        >
          {drag?.canEdit && (
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" />
          )}
          <Avatar className="size-8 shrink-0">
            {person.avatar && <AvatarImage src={person.avatar} alt="" />}
            <AvatarFallback className="text-xs">
              {initials(person.name, person.email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-tight">{person.name}</span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {[person.jobTitle, person.department].filter(Boolean).join(" · ")}
            </span>
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
  onOpenProfile,
}: {
  people: Person[];
  statuses: Map<string, PersonStatus>;
  /** Admins can drag someone onto another person to change who they report to. */
  canEdit?: boolean;
  onOpenProfile: (id: Id<"users">) => void;
}) {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const setManager = useMutation(api.users.setManager);
  const teams = useQuery(api.orgData.listTeams, canEdit ? {} : "skip");
  const departments = useQuery(api.orgData.listDepartments, canEdit ? {} : "skip");
  const [dragging, setDragging] = useState<Id<"users"> | null>(null);
  const [overRoot, setOverRoot] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);

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

  const blocked = useMemo(() => {
    const out = new Set<string>();
    if (!dragging) return out;
    const stack = [dragging as string];
    while (stack.length) {
      const id = stack.pop()!;
      out.add(id);
      for (const report of reportsOf.get(id) ?? []) stack.push(report._id);
    }
    return out;
  }, [dragging, reportsOf]);

  function onDropOn(managerId: Id<"users"> | null) {
    const personId = dragging;
    setDragging(null);
    if (!personId) return;
    const person = people.find((p) => p._id === personId);
    const manager = managerId ? people.find((p) => p._id === managerId) : undefined;
    if (!person || person.managerId === managerId) return;
    setManager({ userId: personId, managerId: managerId ?? undefined, reportsVia: "manual" })
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

  const dragState: DragState = { canEdit, dragging, setDragging, blocked, onDropOn };

  return (
    <DragContext.Provider value={dragState}>
      <div className="space-y-6">
        {canEdit && dragging && (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setOverRoot(true);
            }}
            onDragLeave={() => setOverRoot(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOverRoot(false);
              onDropOn(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors",
              overRoot && "border-foreground/40 bg-accent text-foreground",
            )}
          >
            <UserX className="size-4" />
            {t("orgDropNoManager")}
          </div>
        )}
        {canEdit && !dragging && (
          <p className="text-xs text-muted-foreground">{t("orgDragHint")}</p>
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
      <MembershipOffer key={offer?.person._id} offer={offer} onClose={() => setOffer(null)} />
    </DragContext.Provider>
  );
}
