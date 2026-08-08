"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { LayoutGrid, List, Rows3, Search, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  hasRealName,
  personStatus,
  type Person,
  type PersonStatus,
} from "@/components/directory/person-status";
import { PersonCard } from "@/components/directory/PersonCard";
import { PersonTable, type SortDir, type SortKey } from "@/components/directory/PersonTable";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { UserProfile } from "@/components/profile/UserProfile";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { useNow } from "@/lib/activity/useNow";
import { TEAMS, teamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "grid";

export default function DirectoryPage() {
  const t = useTranslations("Directory");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const me = useCurrentUser();
  const now = useNow();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("list");
  const [grouped, setGrouped] = useState(false);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);

  // Deep link from a notification/mention: /directory?user=<id> opens their
  // profile dialog directly instead of requiring a click from the list.
  const deepLinkUserId = useDeepLinkId("user");
  useEffect(() => {
    // One-shot sync from the deep-link id (already a one-shot value itself)
    // into local dialog state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deepLinkUserId) setProfileId(deepLinkUserId as Id<"users">);
  }, [deepLinkUserId]);

  // Debounced so typing doesn't re-fire the directoryList query on every
  // keystroke — the input stays instantly responsive since it's bound to the
  // undebounced `search` state directly.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const departments = useQuery(api.users.departments) ?? [];
  const people = useQuery(api.users.directoryList, {
    search: debouncedSearch || undefined,
    department: department === "all" ? undefined : department,
  });
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);

  // Device-active + clocked-in via Clockodo — a much more meaningful signal
  // than the old "has an open intranet tab" heuristic, but not everyone is
  // on the ActivityTrack roster, so `null` means "no data" rather than
  // "not in office" (see `personStatus`).
  const userIds = useMemo(() => (people ?? []).map((p) => p._id), [people]);
  const officePresence = useQuery(api.activity.state.inOfficeForUsers, { userIds });
  const inOfficeByUserId = useMemo(() => {
    const map = new Map<string, boolean | null>();
    for (const row of officePresence ?? []) map.set(row.userId, row.inOffice);
    return map;
  }, [officePresence]);

  // "Out today" is Clockodo-derived and fetched live (see AGENTS.md's
  // Clockodo section) — Convex has no HTTP access, so directoryList itself
  // can no longer join this in; the page joins it client-side instead.
  const today = isoToday();
  const outToday = useAbsencesCalendar(today, today);
  const outUntilByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of outToday ?? []) {
      const prev = map.get(a.userId);
      if (!prev || a.endDate > prev) map.set(a.userId, a.endDate);
    }
    return map;
  }, [outToday]);

  async function message(userId: Id<"users">) {
    const { conversationId } = await getOrCreateDm({ otherUserId: userId });
    router.push(`/chat?c=${conversationId}`);
  }

  const filtered = useMemo(() => {
    let rows = people ?? [];
    if (role !== "all") rows = rows.filter((p) => p.role === role);
    if (team !== "all") rows = rows.filter((p) => p.teams.includes(team));
    const key = (p: Person) =>
      sort === "department" ? (p.department ?? "￿") : sort === "role" ? p.role : p.name;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * (key(a).localeCompare(key(b)) || a.name.localeCompare(b.name)),
    );
  }, [people, role, team, sort, sortDir]);

  const statuses = useMemo(() => {
    const map = new Map<string, PersonStatus>();
    for (const p of filtered) {
      map.set(p._id, personStatus(p, now, inOfficeByUserId.get(p._id), outUntilByUser.get(p._id)));
    }
    return map;
  }, [filtered, now, inOfficeByUserId, outUntilByUser]);

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir("asc");
    }
  }

  const sections = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, Person[]>();
    for (const p of filtered) {
      const dept = p.department ?? t("noDepartment");
      const list = map.get(dept) ?? [];
      list.push(p);
      map.set(dept, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, grouped, t]);

  const filtersActive = role !== "all" || team !== "all" || department !== "all" || search !== "";
  const missingNames = useMemo(
    () => (people ?? []).filter((p) => !hasRealName(p)).length,
    [people],
  );

  const renderPeople = (rows: Person[]) =>
    view === "grid" ? (
      // Three across until there's real room for four: `directoryList` falls
      // back to the email address for anyone without a name on file, and an
      // email in the identity slot needs the extra width to avoid truncating.
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rows.map((p) => (
          <PersonCard
            key={p._id}
            person={p}
            status={statuses.get(p._id) ?? { kind: "away" }}
            onOpenProfile={() => setProfileId(p._id)}
            onMessage={p._id === me._id ? undefined : () => void message(p._id)}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-[var(--radius)] border border-border/70 bg-card">
        <PersonTable
          people={rows}
          statuses={statuses}
          sort={sort}
          sortDir={sortDir}
          onSort={toggleSort}
          onOpenProfile={setProfileId}
          onMessage={(id) => void message(id)}
          currentUserId={me._id}
        />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeaderBar title={t("title")} tourCheckpoint="directory" />

      <div className="mb-4 space-y-2.5" data-tour="tour-directory-filters">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder={t("department")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allDepartments")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* View switch. `list` is the default: at this org's size a table is
              simply the more readable shape, and the grid is for browsing faces. */}
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5"
            role="group"
            aria-label={t("view")}
          >
            {(
              [
                ["list", List, t("viewList")],
                ["grid", LayoutGrid, t("viewGrid")],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                aria-label={label}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  "grid size-8 place-items-center rounded-md transition-colors",
                  view === mode
                    ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "admin", "manager", "employee"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                role === r
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {r === "all" ? tCommon("all") : tRoles(r)}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {TEAMS.map((tm) => (
            <button
              key={tm.id}
              type="button"
              onClick={() => setTeam(team === tm.id ? "all" : tm.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                team === tm.id
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <span className={cn("size-1.5 rounded-full", teamColor(tm.id))} />
              {tTeams(tm.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setGrouped((v) => !v)}
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              grouped
                ? "border-transparent bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <Rows3 className="size-3" />
            {t("groupByDept")}
          </button>
        </div>

        {/* Result count, so a filter that narrows to two people says so rather
            than leaving the reader to count cards. */}
        <div className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
          {people === undefined ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <>
              <span>{t("countPeople", { count: filtered.length })}</span>
              {missingNames > 0 && (
                <span className="text-warn">· {t("missingNames", { count: missingNames })}</span>
              )}
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => {
                    setSearch("");
                    setRole("all");
                    setTeam("all");
                    setDepartment("all");
                  }}
                >
                  <X className="size-3" />
                  {t("clearFilters")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div data-tour="tour-directory-grid">
        {people === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users />} title={t("noResults")} />
        ) : sections ? (
          <div className="space-y-6">
            {sections.map(([dept, rows]) => (
              <section key={dept}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dept} <span className="font-normal normal-case">({rows.length})</span>
                </h2>
                {renderPeople(rows)}
              </section>
            ))}
          </div>
        ) : (
          renderPeople(filtered)
        )}
      </div>

      <UserProfile
        userId={profileId}
        open={!!profileId}
        onOpenChange={(o) => {
          if (!o) setProfileId(null);
        }}
      />
    </div>
  );
}
