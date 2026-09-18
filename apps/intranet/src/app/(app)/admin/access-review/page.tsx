"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A confirmation older than this counts as due again. */
const REVIEW_EVERY_DAYS = 90;
const INACTIVE_DAYS = 60;

type Filter = "due" | "inactive" | "all";

export default function AccessReviewPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const handleError = useErrorHandler();
  const rows = useQuery(api.people.users.accessReviewList, isAdmin ? {} : "skip");
  const markReviewed = useMutation(api.people.users.markAccessReviewed);
  const [filter, setFilter] = useState<Filter>("due");

  const enriched = useMemo(() => {
    const now = Date.now();
    return (rows ?? [])
      .map((row) => ({
        ...row,
        due: !row.reviewedAt || now - row.reviewedAt > REVIEW_EVERY_DAYS * DAY_MS,
        inactive: !row.lastActiveAt || now - row.lastActiveAt > INACTIVE_DAYS * DAY_MS,
      }))
      .sort(
        (a, b) =>
          Number(b.inactive) - Number(a.inactive) ||
          Number(b.due) - Number(a.due) ||
          a.name.localeCompare(b.name),
      );
  }, [rows]);

  if (!isAdmin) return <ForbiddenScreen />;

  const due = enriched.filter((r) => r.due).length;
  const inactive = enriched.filter((r) => r.inactive).length;
  const shown = enriched.filter((r) =>
    filter === "due" ? r.due : filter === "inactive" ? r.inactive : true,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeaderBar
        title={t("accessReview.title")}
        description={t("accessReview.description")}
        icon={<UserCheck />}
      />

      <KpiStrip className="lg:grid-cols-3">
        <Kpi
          featured
          label={t("accessReview.due")}
          value={due}
          hint={t("accessReview.dueHint", { days: REVIEW_EVERY_DAYS })}
        />
        <Kpi
          label={t("accessReview.inactive")}
          value={inactive}
          tone={inactive > 0 ? "warn" : "neutral"}
          hint={t("accessReview.inactiveHint", { days: INACTIVE_DAYS })}
        />
        <Kpi label={t("accessReview.total")} value={enriched.length} />
      </KpiStrip>

      <div className="flex items-center gap-1 rounded-lg border border-border/70 p-0.5 text-xs font-medium sm:w-fit">
        {(["due", "inactive", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 transition-colors sm:flex-none",
              filter === value ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {t(`accessReview.filter_${value}`)}
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-border/60 py-12 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          {t("accessReview.allClear")}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
          {shown.map((row) => (
            <li key={row._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.role !== "employee" && (
                    <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-medium">
                      {t(`accessReview.role_${row.role}`)}
                    </span>
                  )}
                  {row.customRoles.map((name) => (
                    <span
                      key={name}
                      className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                  {row.grants.map((grant) => (
                    <span
                      key={grant}
                      className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {t(`accessReview.grant_${grant}`)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="w-36 text-xs">
                <p className="text-muted-foreground">{t("accessReview.lastActive")}</p>
                <p className={cn("tabular-nums", row.inactive && "text-warning")}>
                  {row.lastActiveAt ? relativeTime(row.lastActiveAt) : t("accessReview.never")}
                </p>
              </div>
              <div className="w-40 text-xs">
                <p className="text-muted-foreground">{t("accessReview.reviewed")}</p>
                <p className={cn(row.due && "text-warning")}>
                  {row.reviewedAt
                    ? `${new Date(row.reviewedAt).toLocaleDateString(locale)}${row.reviewedByName ? ` · ${row.reviewedByName}` : ""}`
                    : t("accessReview.never")}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/members">{t("accessReview.change")}</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    markReviewed({ userId: row._id })
                      .then(() => toast.success(t("accessReview.confirmed", { name: row.name })))
                      .catch(handleError)
                  }
                >
                  {t("accessReview.stillNeeded")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
