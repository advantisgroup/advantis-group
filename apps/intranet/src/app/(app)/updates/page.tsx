"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AlertTriangle, Plus, Rss, Search, Sparkles, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
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
import {
  formatDuration,
  KNOWN_SYSTEMS,
  statusesForType,
  type UpdateType,
} from "@/lib/updates";

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

  const items = useQuery(api.updates.list, {
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : (status as never),
    affectedSystem: affectedSystem === "all" ? undefined : affectedSystem,
    search: search.trim() || undefined,
  });

  const statusOptions = type === "all" ? [] : statusesForType(type);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={<Rss />}
        action={
          isAdmin ? (
            <Button asChild>
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
        onValueChange={v => {
          setType(v as UpdateType | "all");
          setStatus("all");
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="all">{t("tabAll")}</TabsTrigger>
          <TabsTrigger value="incident">{t("tabIncident")}</TabsTrigger>
          <TabsTrigger value="maintenance">{t("tabMaintenance")}</TabsTrigger>
          <TabsTrigger value="changelog">{t("tabChangelog")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
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
              {statusOptions.map(s => (
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
            {KNOWN_SYSTEMS.map(s => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items === undefined ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Rss />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const Icon = TYPE_ICON[item.type];
            return (
              <Link
                key={item._id}
                href={`/updates/${item._id}`}
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
                    {item.scheduled && (
                      <Badge variant="outline">{t("scheduled")}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(item.publishedAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium">{item.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                  {item.durationMs !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.ongoing
                        ? t("ongoingFor", { duration: formatDuration(item.durationMs) })
                        : t("resolvedAfter", { duration: formatDuration(item.durationMs) })}
                      {" · "}
                      {formatDateTime(item.startedAt, locale)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
