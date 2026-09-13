"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Bookmark,
  BookmarkPlus,
  LayoutGrid,
  List,
  Network,
  Rows3,
  Search,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  hasRealName,
  personStatus,
  type Person,
  type PersonStatus,
} from "@/components/directory/person-status";
import { OrgChart } from "@/components/directory/OrgChart";
import { PersonCard } from "@/components/directory/PersonCard";
import { PersonTable, type SortDir, type SortKey } from "@/components/directory/PersonTable";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { UserProfile } from "@/components/profile/UserProfile";
import {
  useCurrentUser,
  useHasCapability,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { useNow } from "@/lib/activity/useNow";
import { TEAMS, teamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "grid" | "org";

type SavedDirectoryView = {
  id: string;
  name: string;
  department: string;
  role: string;
  team: string;
  myTeamsOnly: boolean;
  availableNow: boolean;
  grouped: boolean;
  view: Exclude<ViewMode, "org">;
};

function DirectoryPageContent() {
  const t = useTranslations("Directory");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const params = useSearchParams();
  const me = useCurrentUser();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const canManageMembers = useHasCapability("manage_members");
  const now = useNow();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");
  const [myTeamsOnly, setMyTeamsOnly] = useState(false);
  const [availableNow, setAvailableNow] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("list");
  const [grouped, setGrouped] = useState(false);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  // Deep link from a notification/mention: /directory?user=<id> opens their
  // profile dialog directly instead of requiring a click from the list.
  const deepLinkUserId = useDeepLinkId("user");
  useEffect(() => {
    // One-shot sync from the deep-link id (already a one-shot value itself)
    // into local dialog state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deepLinkUserId) setProfileId(deepLinkUserId as Id<"users">);
  }, [deepLinkUserId]);

  useEffect(() => {
    if (params.get("scope") === "my-teams" && me.teams.length > 0) {
      setMyTeamsOnly(true);
    }
    if (params.get("availability") === "now") setAvailableNow(true);
  }, [me.teams.length, params]);

  // Debounced so typing doesn't re-fire the directoryList query on every
  // keystroke — the input stays instantly responsive since it's bound to the
  // undebounced `search` state directly.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const departments = useQuery(api.users.departments) ?? [];
  const preferences = useQuery(api.userPreferences.getMine);
  const people = useQuery(api.users.directoryList, {
    search: debouncedSearch || undefined,
    department: department === "all" ? undefined : department,
  });
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const setPreferences = useMutation(api.userPreferences.setMine);
  const savedDirectoryViews = preferences?.savedDirectoryViews ?? [];

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

  function applySavedView(savedView: SavedDirectoryView) {
    setSearch("");
    setDepartment(departments.includes(savedView.department) ? savedView.department : "all");
    setRole(
      ["all", "admin", "manager", "employee"].includes(savedView.role) ? savedView.role : "all",
    );
    setTeam(TEAMS.some((candidate) => candidate.id === savedView.team) ? savedView.team : "all");
    setMyTeamsOnly(savedView.myTeamsOnly && me.teams.length > 0);
    setAvailableNow(savedView.availableNow && isManager);
    setGrouped(savedView.grouped);
    setView(savedView.view);
  }

  async function saveDirectoryView() {
    const name = viewName.trim();
    if (!name) return;
    const savedView: SavedDirectoryView = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      department,
      role,
      team,
      myTeamsOnly,
      availableNow,
      grouped,
      view: view === "org" ? "list" : view,
    };
    await setPreferences({
      savedDirectoryViews: [...savedDirectoryViews, savedView].slice(-8),
    });
    setViewName("");
    setSaveViewOpen(false);
  }

  async function removeSavedView(id: string) {
    await setPreferences({
      savedDirectoryViews: savedDirectoryViews.filter((savedView) => savedView.id !== id),
    });
  }

  const filtered = useMemo(() => {
    let rows = people ?? [];
    if (role !== "all") rows = rows.filter((p) => p.role === role);
    if (myTeamsOnly) rows = rows.filter((p) => p.teams.some((value) => me.teams.includes(value)));
    else if (team !== "all") rows = rows.filter((p) => p.teams.includes(team));
    if (availableNow) {
      rows = rows.filter((person) => {
        const status = personStatus(
          person,
          now,
          inOfficeByUserId.get(person._id),
          outUntilByUser.get(person._id),
        );
        return status.kind === "inOffice" || status.kind === "online";
      });
    }
    const key = (p: Person) =>
      sort === "department" ? (p.department ?? "￿") : sort === "role" ? p.role : p.name;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * (key(a).localeCompare(key(b)) || a.name.localeCompare(b.name)),
    );
  }, [
    availableNow,
    inOfficeByUserId,
    me.teams,
    myTeamsOnly,
    now,
    outUntilByUser,
    people,
    role,
    sort,
    sortDir,
    team,
  ]);

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

  const filtersActive =
    role !== "all" ||
    team !== "all" ||
    myTeamsOnly ||
    availableNow ||
    department !== "all" ||
    search !== "";
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

  // View switch. `list` is the default: at this org's size a table is
  // simply the more readable shape, and the grid is for browsing faces.
  const viewSwitch = (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5 refreshed:bg-muted/40"
      role="group"
      aria-label={t("view")}
    >
      {(
        [
          ["list", List, t("viewList")],
          ["grid", LayoutGrid, t("viewGrid")],
          ["org", Network, t("viewOrg")],
        ] as const
      ).map(([mode, Icon, label]) => (
        <button
          key={mode}
          type="button"
          aria-label={label}
          aria-pressed={view === mode}
          onClick={() => setView(mode)}
          className={cn(
            "grid size-8 place-items-center rounded-md transition-colors refreshed:size-7",
            view === mode
              ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );

  // Result count, so a filter that narrows to two people says so rather
  // than leaving the reader to count cards.
  const countRow = (
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
                setMyTeamsOnly(false);
                setAvailableNow(false);
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
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeaderBar title={t("title")} tourCheckpoint="directory" />

      <div className="mb-4 space-y-2" data-tour="tour-directory-filters">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-1">
            {departments.length > 0 && (
              <FilterPill
                label={t("department")}
                options={departments.map((d) => ({ value: d, label: d }))}
                selected={department === "all" ? [] : [department]}
                onChange={(next) => setDepartment(next.find((d) => d !== department) ?? "all")}
                clearLabel={t("clearFilter", { label: t("department") })}
              />
            )}
            <FilterPill
              label={t("role")}
              options={(["admin", "manager", "employee"] as const).map((r) => ({
                value: r,
                label: tRoles(r),
              }))}
              selected={role === "all" ? [] : [role]}
              onChange={(next) => setRole(next.find((r) => r !== role) ?? "all")}
              clearLabel={t("clearFilter", { label: t("role") })}
            />
            <FilterPill
              label={t("team")}
              options={TEAMS.map((tm) => ({
                value: tm.id,
                label: tTeams(tm.labelKey),
                leading: <span className={cn("size-2 shrink-0 rounded-full", teamColor(tm.id))} />,
              }))}
              selected={team === "all" ? [] : [team]}
              onChange={(next) => {
                setMyTeamsOnly(false);
                setTeam(next.find((id) => id !== team) ?? "all");
              }}
              clearLabel={t("clearFilter", { label: t("team") })}
            />
            {me.teams.length > 0 && (
              <TogglePill
                active={myTeamsOnly}
                onClick={() => {
                  setMyTeamsOnly((value) => !value);
                  setTeam("all");
                }}
              >
                {t("myTeams")}
              </TogglePill>
            )}
            {isManager && (
              <TogglePill
                active={availableNow}
                onClick={() => setAvailableNow((value) => !value)}
                dotClassName="bg-ok"
              >
                {t("availableNow")}
              </TogglePill>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <TogglePill active={grouped} onClick={() => setGrouped((v) => !v)}>
                <Rows3 className="size-3" />
                {t("groupByDept")}
              </TogglePill>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="shrink-0">
                    <Bookmark />
                    {t("views")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>{t("savedViews")}</DropdownMenuLabel>
                  {savedDirectoryViews.length === 0 ? (
                    <p className="px-2 pb-2 text-xs text-muted-foreground">{t("noViews")}</p>
                  ) : (
                    savedDirectoryViews.map((savedView) => (
                      <DropdownMenuItem
                        key={savedView.id}
                        onClick={() => applySavedView(savedView)}
                        className="group justify-between gap-2"
                      >
                        <span className="truncate">{savedView.name}</span>
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label={t("removeSavedView", { name: savedView.name })}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeSavedView(savedView.id);
                          }}
                          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus:opacity-100 max-md:opacity-100"
                        >
                          <X className="size-3.5" />
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSaveViewOpen(true)}>
                    <BookmarkPlus />
                    {t("saveView")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {viewSwitch}
            </div>
          </div>
        </div>
        {countRow}
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
        ) : view === "org" ? (
          <OrgChart
            people={filtered}
            statuses={statuses}
            canEdit={isAdmin}
            canSetDepartment={canManageMembers}
            onOpenProfile={setProfileId}
          />
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

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveViewTitle")}</DialogTitle>
            <DialogDescription>{t("saveViewDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void (event.preventDefault(), saveDirectoryView())}>
            <label htmlFor="directory-view-name" className="mb-2 block text-sm font-medium">
              {t("viewName")}
            </label>
            <Input
              id="directory-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder={t("viewNamePlaceholder")}
              autoFocus
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveViewOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!viewName.trim()}
              onClick={() => void saveDirectoryView()}
            >
              {t("saveView")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      }
    >
      <DirectoryPageContent />
    </Suspense>
  );
}
