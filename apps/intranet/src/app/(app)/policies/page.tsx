"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ChevronRight, ScrollText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useHasCapability } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/format";
import { localIsoDate } from "@/lib/absences";

const STATE_BADGE = {
  confirmed: "success",
  changed: "warning",
  pending: "warning",
} as const;

/**
 * The company's policies in one list: each one's version, when it last
 * changed, and whether you've confirmed the current version. People who
 * manage the wiki also see how many colleagues have. A policy is a wiki
 * page marked as one, so it's written and edited like any other page.
 */
export default function PoliciesPage() {
  const t = useTranslations("Policies");
  const locale = useLocale();
  const canManage = useHasCapability("manage_guidebooks");
  const policies = useQuery(api.wiki.policies.list);
  const open = policies?.filter((p) => p.state !== "confirmed").length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={<ScrollText />}
        action={
          canManage ? (
            <Button size="sm" variant="outline" asChild>
              <Link href="/guidebooks/new">{t("add")}</Link>
            </Button>
          ) : undefined
        }
      />
      {policies === undefined ? (
        <SkeletonRows rows={4} />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={t("emptyTitle")}
          description={canManage ? t("emptyHintManager") : t("emptyHint")}
        />
      ) : (
        <>
          {open > 0 && (
            <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm">
              {t("openCount", { count: open })}
            </p>
          )}
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {policies.map((p) => (
              <li key={p._id}>
                <Link
                  href={`/guidebooks/${encodeURIComponent(p.slug)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <ScrollText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {t("meta", {
                        version: p.version,
                        date: formatIsoDate(localIsoDate(new Date(p.updatedAt)), locale),
                      })}
                      {p.confirmedCount !== null &&
                        p.audienceCount !== null &&
                        ` · ${t("confirmedBy", { count: p.confirmedCount, total: p.audienceCount })}`}
                    </span>
                  </span>
                  <Badge variant={STATE_BADGE[p.state]} className="shrink-0">
                    {t(`state.${p.state}`)}
                  </Badge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
