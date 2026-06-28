"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";
import { api } from "@advantis/convex/api";
import { useI18n } from "@/lib/activity/i18n";
import {
  formatDuration,
  formatRelativeTime,
  formatTime,
  roleAtLeast,
  type Role,
} from "@/lib/activity/fmt";
import {
  SEVERITY_DOT_CLASS as SEV_DOT,
  type Severity,
} from "@/lib/activity/ui";
import { useMutationWithToast } from "@/lib/activity/useMutationWithToast";
import { InfoTip } from "@/components/activity/InfoTip";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/activity/Skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SEV_VARIANT: Record<Severity, "muted" | "warning" | "destructive"> = {
  info: "muted",
  warning: "warning",
  error: "destructive",
  critical: "destructive",
};

/** Friendly one-liner for an event code, falling back gracefully. */
function friendly(
  t: (k: string, v?: Record<string, string | number>) => string,
  code: string
): string {
  const key = `health.friendly.${code}`;
  const msg = t(key);
  return msg === key ? t("health.friendly.unknown") : msg;
}

/** Plain-language "what to do about it" for an event code (tooltip). */
function fixFor(
  t: (k: string, v?: Record<string, string | number>) => string,
  code: string
): string {
  const key = `health.fix.${code}`;
  const msg = t(key);
  return msg === key ? t("health.fix.unknown") : msg;
}

/** System health: device connectivity + reported issues. Settings hub tab. */
export function SystemPanel() {
  const { t, lang } = useI18n();
  const me = useQuery(api.users.me);
  const health = useQuery(api.activity.events.health);
  const isAdmin = roleAtLeast((me?.role ?? "viewer") as Role, "it_admin");

  const [onlyOpen, setOnlyOpen] = useState(true);
  const events = useQuery(
    api.activity.events.listEvents,
    isAdmin ? { onlyOpen } : "skip"
  );

  const resolve = useMutationWithToast(api.activity.events.resolveEvent);

  if (health === undefined) {
    return (
      <section className="space-y-6">
        <SkeletonCard />
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  const attentionCount = health.offlineDevices.length + health.openEventCount;
  const allGood = attentionCount === 0;
  const minorWorst =
    health.worstSeverity === "info" || health.worstSeverity === "warning";

  return (
    <section className="space-y-8">
      {/* ── Status banner ─────────────────────────────────────────────── */}
      {allGood ? (
        <Card className="animate-fade-up border-ok/30 bg-ok/5">
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok/15 text-ok">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-ok">{t("health.allGood.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("health.allGood.body")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={`animate-fade-up ${
            minorWorst
              ? "border-warn/30 bg-warn/5"
              : "border-danger/30 bg-danger/5"
          }`}
        >
          <CardContent className="flex items-center gap-3 p-5">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                minorWorst ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-fg">
                {t("health.attention.title", { count: attentionCount })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("health.attention.body")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Offline devices (friendly) ────────────────────────────────── */}
      {health.offlineDevices.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("health.offline.heading")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {health.offlineDevices.map(d => (
              <Card key={d.deviceId} className="animate-fade-up">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 shrink-0 text-danger" />
                    <p className="font-medium text-fg">
                      {d.personName ?? d.hostname}
                    </p>
                  </div>
                  {d.personName && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.hostname}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("health.offline.for", {
                      duration: formatDuration(d.offlineForMs / 1000, lang),
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("health.offline.lastSeen", {
                      time: formatRelativeTime(d.lastSeen, lang),
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Reported issues (friendly digest) ─────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("health.issues.heading")}
        </h2>
        {health.recentIssues.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("health.issues.none")}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {health.recentIssues.map(issue => (
              <li key={issue.id} className="animate-fade-up">
                <Card>
                  <CardContent className="flex items-start gap-3 p-4">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[issue.severity]}`}
                    />
                    <div className="flex-1">
                      <p className="flex items-center gap-1.5 text-sm text-fg">
                        {friendly(t, issue.code)}
                        <InfoTip text={fixFor(t, issue.code)} />
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {issue.hostname ? `${issue.hostname} · ` : ""}
                        {issue.count > 1 &&
                          `${t("health.issues.occurrences", { count: issue.count })} · `}
                        {t("health.issues.lastAt", {
                          time: formatTime(issue.lastAt, lang),
                        })}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void resolve(
                            { eventId: issue.id },
                            { success: t("health.resolved") }
                          )
                        }
                      >
                        {t("health.resolve")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Technical detail (IT only) ────────────────────────────────── */}
      {isAdmin && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("health.detail.heading")}
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOnlyOpen(v => !v)}
            >
              {onlyOpen
                ? t("health.detail.toggleAll")
                : t("health.detail.toggleOpen")}
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("health.detail.severity")}</TableHead>
                  <TableHead>{t("health.detail.event")}</TableHead>
                  <TableHead>{t("health.detail.message")}</TableHead>
                  <TableHead>{t("health.detail.source")}</TableHead>
                  <TableHead>{t("health.detail.device")}</TableHead>
                  <TableHead>{t("health.detail.count")}</TableHead>
                  <TableHead>{t("health.detail.lastAt")}</TableHead>
                  <TableHead>{t("health.detail.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events === undefined ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-24 w-full" />
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {t("health.detail.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map(e => (
                    <TableRow key={e._id} className="align-top">
                      <TableCell>
                        <Badge variant={SEV_VARIANT[e.severity]}>
                          {t(`health.sev.${e.severity}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.code}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.message}
                        {e.context && (
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground/70">
                            {e.context}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`health.src.${e.source}`)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.hostname ?? e.deviceId ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{e.count}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatTime(e.lastAt, lang)}
                      </TableCell>
                      <TableCell>
                        {e.resolvedAt ? (
                          <span className="text-xs text-ok">
                            {t("health.detail.statusResolved")}
                          </span>
                        ) : (
                          <span className="text-xs text-warn">
                            {t("health.detail.statusOpen")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!e.resolvedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void resolve(
                                { eventId: e._id },
                                { success: t("health.resolved") }
                              )
                            }
                          >
                            {t("health.resolve")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </section>
  );
}
