"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AlertTriangle, Plus, Rss, Search, Sparkles, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { DocumentHeader } from "@/components/layout/DocumentHeader";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, relativeTime } from "@/lib/format";
import { formatDuration, KNOWN_SYSTEMS, statusesForType, type UpdateType } from "@/lib/updates";

const LAST_VISIT_KEY = "updates:lastVisit";

const TYPE_ICON = {
  incident: AlertTriangle,
  maintenance: Wrench,
  changelog: Sparkles,
} as const;

const TYPE_BADGE_VARIANT = {
  incident: "destructive",
  maintenance: "warning",
  changelog: "success",
} as const;

export default function UpdatesPage() {
  const t = useTranslations("Updates");
  const locale = useLocale();
  const isAdmin = useIsAdmin();

  const [type, setType] = useState<UpdateType | "all">("all");
  const [status, setStatus] = useState<string>("all");
  const [affectedSystem, setAffectedSystem] = useState<string>("all");
  const [search, setSearch] = useState("");

  const items = useQuery(api.updates.updates.list, {
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : (status as never),
    affectedSystem: affectedSystem === "all" ? undefined : affectedSystem,
    search: search.trim() || undefined,
  });

  const statusOptions = type === "all" ? [] : statusesForType(type);

  const [lastVisit, setLastVisit] = useState<number | null>(null);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(LAST_VISIT_KEY));
      setLastVisit(stored || null);
      localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    } catch {
      // storage can be blocked; everything just reads as seen
    }
  }, []);

  const groups = useMemo(() => {
    const out: { key: string; label: string; fresh: number; items: NonNullable<typeof items> }[] =
      [];
    for (const item of items ?? []) {
      const date = new Date(item.publishedAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      let group = out.at(-1);
      if (group?.key !== key) {
        group = {
          key,
          label: date.toLocaleDateString(locale, { month: "long", year: "numeric" }),
          fresh: 0,
          items: [],
        };
        out.push(group);
      }
      group.items.push(item);
      if (lastVisit !== null && item.publishedAt > lastVisit) group.fresh++;
    }
    return out;
  }, [items, lastVisit, locale]);

  return (
    <div className="mx-auto max-w-4xl">
      <DocumentHeader
        title={t("title")}
        description={t("description")}
        action={
          isAdmin ? (
            <Button data-shortcut-new asChild>
              <Link href="/updates/new">
                <Plus className="size-4" />
                {t("newUpdate")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={type}
        onValueChange={(v) => {
          setType(v as UpdateType | "all");
          setStatus("all");
        }}
        className="mb-4"
      >
        {/* A full-width horizontal strip here would be a second control
            competing with the mobile bottom nav's thumb-zone space, so below
            md this collapses to a single compact Select instead — matching
            the status/system filters right below it, which are Selects on
            every screen size already. */}
        <TabsList className="hidden md:inline-flex">
          <TabsTrigger value="all">{t("tabAll")}</TabsTrigger>
          <TabsTrigger value="incident">{t("tabIncident")}</TabsTrigger>
          <TabsTrigger value="maintenance">{t("tabMaintenance")}</TabsTrigger>
          <TabsTrigger value="changelog">{t("tabChangelog")}</TabsTrigger>
        </TabsList>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as UpdateType | "all");
            setStatus("all");
          }}
        >
          <SelectTrigger className="md:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tabAll")}</SelectItem>
            <SelectItem value="incident">{t("tabIncident")}</SelectItem>
            <SelectItem value="maintenance">{t("tabMaintenance")}</SelectItem>
            <SelectItem value="changelog">{t("tabChangelog")}</SelectItem>
          </SelectContent>
        </Select>
      </Tabs>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
        {statusOptions.length > 0 && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={affectedSystem} onValueChange={setAffectedSystem}>
          <SelectTrigger className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSystems")}</SelectItem>
            {KNOWN_SYSTEMS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items === undefined ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Rss />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            isAdmin ? (
              <Button asChild size="sm">
                <Link href="/updates/new">
                  <Plus />
                  {t("newUpdate")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {group.label}
                {group.fresh > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {t("newSinceVisit", { count: group.fresh })}
                  </span>
                )}
              </h2>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const Icon = TYPE_ICON[item.type];
                  return (
                    <Link
                      key={item._id}
                      href={`/updates/${item._id}`}
                      data-shortcut-item
                      className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 transition-colors hover:bg-accent"
                    >
                      <span
                        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          item.type === "incident"
                            ? "bg-destructive/10 text-destructive"
                            : item.type === "maintenance"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={TYPE_BADGE_VARIANT[item.type]}>
                            {t(`type.${item.type}`)}
                          </Badge>
                          {item.status && (
                            <Badge variant={item.ongoing ? "warning" : "muted"}>
                              {t(`status.${item.status}`)}
                            </Badge>
                          )}
                          {item.scheduled && <Badge variant="outline">{t("scheduled")}</Badge>}
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(item.publishedAt)}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-2 font-medium">
                          {lastVisit !== null && item.publishedAt > lastVisit && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                              aria-label={t("newItem")}
                            />
                          )}
                          <span className="truncate">{item.title}</span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{item.summary}</p>
                        {item.durationMs !== null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.ongoing
                              ? t("ongoingFor", {
                                  duration: formatDuration(item.durationMs),
                                })
                              : t("resolvedAfter", {
                                  duration: formatDuration(item.durationMs),
                                })}
                            {" · "}
                            {formatDateTime(item.startedAt ?? item.publishedAt, locale)}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
