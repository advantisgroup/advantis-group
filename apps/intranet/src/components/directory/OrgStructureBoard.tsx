"use client";

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Building2, GripVertical, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { type OrgUnits } from "./OrgPersonMenu";
import { type Person } from "./person-status";

const UNASSIGNED = "unassigned";
const DRAG_THRESHOLD_PX = 6;

type Team = OrgUnits["teams"][number];

/**
 * Departments with the teams inside them. Admins drag a team onto another
 * department (or out of all of them) to move it — same pointer-based dragging
 * as the people chart, so it works on touch screens.
 */
export function OrgStructureBoard({ units, people }: { units: OrgUnits; people: Person[] }) {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const setTeamDepartment = useMutation(api.orgData.setTeamDepartment);
  const [dragging, setDragging] = useState<Id<"teams"> | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ id: Id<"teams">; x: number; y: number; active: boolean } | null>(null);

  const teams = units.teams as Team[];
  const nameOf = (id: Id<"users"> | undefined) => people.find((p) => p._id === id)?.name;
  const membersOf = (team: Team) => people.filter((p) => p.teams.includes(team.slug)).length;
  const knownDepartments = new Set(units.departments.map((d) => d._id as string));
  const unassigned = teams.filter(
    (team) => !team.departmentId || !knownDepartments.has(team.departmentId),
  );

  function targetAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-team-drop]");
    return el?.dataset.teamDrop ?? null;
  }

  function startDrag(event: ReactPointerEvent, teamId: Id<"teams">) {
    if (!units.canAdmin || event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    press.current = { id: teamId, x: event.clientX, y: event.clientY, active: false };

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
      setOver(targetAt(e.clientX, e.clientY));
    };
    const end = (e: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      const current = press.current;
      press.current = null;
      const target = e.type === "pointerup" ? targetAt(e.clientX, e.clientY) : null;
      setDragging(null);
      setOver(null);
      setGhost(null);
      if (!current?.active || !target) return;
      const team = teams.find((item) => item._id === current.id);
      const departmentId = target === UNASSIGNED ? null : (target as Id<"departments">);
      if (!team || (team.departmentId ?? null) === departmentId) return;
      setTeamDepartment({ teamId: team._id, departmentId })
        .then(() => toast.success(t("orgSaved")))
        .catch(handleError);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // A render function, not a component: a component declared in here would
  // remount on every drag update and lose the pointer mid-drag.
  function renderTeam(team: Team) {
    const lead = nameOf(team.reportsToUserId);
    return (
      <li
        key={team._id}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-border/70 bg-background py-1.5 pl-1 pr-2.5 text-sm",
          dragging === team._id && "opacity-50",
        )}
      >
        {units.canAdmin ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t("orgDragTeam", { name: team.name })}
            onPointerDown={(event) => startDrag(event, team._id)}
            className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
        ) : (
          <Users2 className="ml-1.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium">{team.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[lead && t("orgLeadName", { name: lead }), t("orgMembers", { count: membersOf(team) })]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </li>
    );
  }

  if (units.departments.length === 0 && teams.length === 0) return null;

  return (
    <section className={cn(dragging && "select-none")}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="size-3.5" />
        {t("orgStructure")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units.departments.map((department) => {
          const lead = nameOf(department.reportsToUserId);
          const inside = teams.filter((team) => team.departmentId === department._id);
          return (
            <div
              key={department._id}
              data-team-drop={department._id}
              className={cn(
                "rounded-xl border border-border/70 bg-card p-3 transition-colors",
                over === department._id && "border-foreground/40 bg-accent",
              )}
            >
              <p className="font-medium">{department.name}</p>
              <p className="text-xs text-muted-foreground">
                {lead ? t("orgLeadName", { name: lead }) : t("orgNoLead")}
              </p>
              {inside.length > 0 ? (
                <ul className="mt-2.5 space-y-1.5">{inside.map(renderTeam)}</ul>
              ) : (
                <p className="mt-2.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                  {units.canAdmin ? t("orgDropTeamHere") : t("orgNoTeams")}
                </p>
              )}
            </div>
          );
        })}
        {(unassigned.length > 0 || dragging) && (
          <div
            data-team-drop={UNASSIGNED}
            className={cn(
              "rounded-xl border border-dashed border-border p-3 transition-colors",
              over === UNASSIGNED && "border-foreground/40 bg-accent",
            )}
          >
            <p className="font-medium text-muted-foreground">{t("orgTeamsWithoutDepartment")}</p>
            {unassigned.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">{unassigned.map(renderTeam)}</ul>
            )}
          </div>
        )}
      </div>
      {ghost && dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-full border border-border/70 bg-popover px-3 py-1.5 text-sm font-medium shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {teams.find((team) => team._id === dragging)?.name}
        </div>
      )}
    </section>
  );
}
