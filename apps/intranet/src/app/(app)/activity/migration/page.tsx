"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { DatabaseZap } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type BadgeVariant } from "@/lib/activity/format";

/**
 * Collapse whitespace and clamp a step's error so a long backend message (or a
 * stray raw response) can't blow out the card layout. Pair with `break-words`
 * and a scroll cap on the container for safety.
 */
function shortError(msg: string, max = 240): string {
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "default";
    case "failed":
      return "destructive";
    case "paused":
      return "warning";
    default:
      return "muted";
  }
}

export default function ActivityMigrationPage() {
  const t = useTranslations("Activity");
  const isAdmin = useCurrentUser().role === "admin";
  const handleError = useErrorHandler();

  const data = useQuery(api.activity.migration.latest, {});
  const start = useMutation(api.activity.migration.start);
  const resume = useMutation(api.activity.migration.resume);
  const retryStep = useMutation(api.activity.migration.retryStep);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  async function onStart() {
    setBusy(true);
    try {
      await start({});
      toast.success(t("migration.start"));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const migration = data?.migration ?? null;
  const steps = data?.steps ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("migration.title")}
        icon={<DatabaseZap />}
        action={
          migration && migration.status !== "completed" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                resume({ migrationId: migration._id }).catch(handleError)
              }
            >
              {t("migration.resume")}
            </Button>
          ) : (
            <Button disabled={busy} onClick={onStart}>
              {t("migration.start")}
            </Button>
          )
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        {t("migration.description")}
      </p>

      {data === undefined ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : !migration ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("migration.notStarted")}
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium">
              {t("migration.status")}:
            </span>
            <Badge variant={statusVariant(migration.status)}>
              {migration.status}
            </Badge>
          </div>

          <div className="space-y-2">
            {steps.map(step => {
              const total = step.total ?? 0;
              const pct =
                total > 0
                  ? Math.min(100, Math.round((step.processed / total) * 100))
                  : step.status === "completed"
                    ? 100
                    : 0;
              return (
                <Card key={step._id}>
                  <CardContent className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-mono text-sm">
                        {step.table}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {(step.warnings ?? 0) > 0 && (
                          <Badge variant="warning">
                            {step.warnings} {t("migration.warnings")}
                          </Badge>
                        )}
                        <Badge variant={statusVariant(step.status)}>
                          {step.status}
                        </Badge>
                        {step.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              retryStep({
                                stepId:
                                  step._id as Id<"activityMigrationSteps">,
                              }).catch(handleError)
                            }
                          >
                            {t("migration.retry")}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t("migration.processed")}: {step.processed}
                        {total > 0 ? ` ${t("migration.of")} ${total}` : ""}
                      </span>
                      {step.failed > 0 && (
                        <span className="text-destructive">
                          {t("migration.failed")}: {step.failed}
                        </span>
                      )}
                    </div>

                    {step.lastError && (
                      <p
                        className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                        title={step.lastError}
                      >
                        {t("migration.lastError")}: {shortError(step.lastError)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
