"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Plane, Search, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "@/components/PageHeader";
import { PersonIdentityBadges } from "@/components/people/PersonIdentityBadges";
import { ONLINE_WINDOW_MS, UserProfile } from "@/components/profile/UserProfile";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { useNow } from "@/lib/activity/useNow";
import { formatIsoDate, initials, roleLabel } from "@/lib/format";
import { TEAMS, teamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type Person = FunctionReturnType<typeof api.users.directoryList>[number];
type SortKey = "name" | "department" | "role";

export default function DirectoryPage() {
  const t = useTranslations("Directory");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const now = useNow();

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [grouped, setGrouped] = useState(false);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Deep link from a notification/mention: /directory?user=<id> opens their
  // profile dialog directly instead of requiring a click from the grid.
  const deepLinkUserId = useDeepLinkId("user");
  useEffect(() => {
    // One-shot sync from the deep-link id (already a one-shot value itself)
    // into local dialog state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deepLinkUserId) setProfileId(deepLinkUserId as Id<"users">);
  }, [deepLinkUserId]);

  const departments = useQuery(api.users.departments) ?? [];
  const people = useQuery(api.users.directoryList, {
    search: search || undefined,
    department: department === "all" ? undefined : department,
  });
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);

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
    return [...rows].sort((a, b) => key(a).localeCompare(key(b)) || a.name.localeCompare(b.name));
  }, [people, role, team, sort]);

  // Alphabet quick-jump: the first person per initial letter carries an anchor.
  const letterAnchors = useMemo(() => {
    if (sort !== "name" || grouped) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const p of filtered) {
      const letter = (p.name[0] ?? "#").toUpperCase();
      if (!map.has(letter)) map.set(letter, p._id);
    }
    return map;
  }, [filtered, sort, grouped]);

  function jumpTo(letter: string) {
    const id = letterAnchors.get(letter);
    if (!id) return;
    gridRef.current
      ?.querySelector(`[data-person="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const personCard = (p: Person) => {
    const online = p.lastActiveAt != null && now - p.lastActiveAt < ONLINE_WINDOW_MS;
    return (
      <Card
        key={p._id}
        data-person={p._id}
        className="scroll-mt-24 transition-colors hover:border-border"
      >
        <CardContent className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => setProfileId(p._id)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <div className="relative shrink-0">
              <Avatar className="h-12 w-12">
                {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                <AvatarFallback>{initials(p.name, p.email)}</AvatarFallback>
              </Avatar>
              {online && (
                <span
                  title={t("online")}
                  className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-success"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{p.name}</span>
                <Badge variant="muted" className="shrink-0">
                  {roleLabel(p, tRoles)}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{p.jobTitle || p.email}</p>
              <PersonIdentityBadges
                role={p.role}
                department={p.department}
                teams={p.teams}
                className="mt-1 flex flex-wrap items-center gap-1"
              />
              {outUntilByUser.get(p._id) && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-sky-600 dark:text-sky-400">
                  <Plane className="size-3 shrink-0" />
                  {t("outUntil", {
                    date: formatIsoDate(outUntilByUser.get(p._id)!, locale),
                  })}
                </p>
              )}
            </div>
          </button>
          {p._id !== me._id && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("startChat")}
              onClick={() => void message(p._id)}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("title")} tourCheckpoint="directory" />

      <div className="mb-4 space-y-2" data-tour="tour-directory-filters">
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
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder={t("department")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("sortName")}</SelectItem>
              <SelectItem value="department">{t("sortDepartment")}</SelectItem>
              <SelectItem value="role">{t("sortRole")}</SelectItem>
            </SelectContent>
          </Select>
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
              "ml-auto rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              grouped
                ? "border-transparent bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t("groupByDept")}
          </button>
        </div>
        {letterAnchors.size > 3 && (
          <div className="hidden flex-wrap gap-0.5 md:flex">
            {[...letterAnchors.keys()].map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => jumpTo(letter)}
                className="flex size-6 items-center justify-center rounded text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={gridRef} data-tour="tour-directory-grid">
        {people && filtered.length === 0 ? (
          <EmptyState icon={<Users />} title={t("noResults")} />
        ) : sections ? (
          <div className="space-y-6">
            {sections.map(([dept, rows]) => (
              <section key={dept}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dept} <span className="font-normal normal-case">({rows.length})</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(personCard)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(personCard)}</div>
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
