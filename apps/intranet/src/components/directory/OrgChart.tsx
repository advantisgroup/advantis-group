"use client";

import { useMemo, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { type Person, type PersonStatus } from "./person-status";
import { StatusPill } from "./StatusPill";

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
  const reports = reportsOf.get(person._id) ?? [];
  const [open, setOpen] = useState(depth < 2);
  const status = statuses.get(person._id);

  return (
    <li>
      <div className="flex items-center gap-1.5 py-1">
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
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
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

export function OrgChart({
  people,
  statuses,
  onOpenProfile,
}: {
  people: Person[];
  statuses: Map<string, PersonStatus>;
  onOpenProfile: (id: Id<"users">) => void;
}) {
  const t = useTranslations("Directory");
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

  return (
    <div className="space-y-6">
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
  );
}
