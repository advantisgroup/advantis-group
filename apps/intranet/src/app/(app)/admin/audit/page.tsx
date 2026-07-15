"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

type Source = "activity" | "onedrive" | "integrations";

function sourceVariant(source: Source): BadgeProps["variant"] {
  switch (source) {
    case "activity":
      return "default";
    case "onedrive":
      return "secondary";
    case "integrations":
      return "outline";
  }
}

export default function AuditLogPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const [source, setSource] = useState<Source | "all">("all");

  const rows = useQuery(api.auditLog.list, {
    source: source === "all" ? undefined : source,
    limit: 200,
  });

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("auditLog.title")}
        description={t("auditLog.description")}
        icon={<ScrollText />}
        action={
          <Select
            value={source}
            onValueChange={v => setSource(v as Source | "all")}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("auditLog.allSources")}</SelectItem>
              <SelectItem value="activity">
                {t("auditLog.source_activity")}
              </SelectItem>
              <SelectItem value="onedrive">
                {t("auditLog.source_onedrive")}
              </SelectItem>
              <SelectItem value="integrations">
                {t("auditLog.source_integrations")}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {rows === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("noAudit")}
        </p>
      ) : (
        <Card className="divide-y divide-border/60">
          {rows.map(row => (
            <div
              key={row._id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge
                  variant={sourceVariant(row.source)}
                  className="text-[10px]"
                >
                  {t(`auditLog.source_${row.source}`)}
                </Badge>
                <span className="font-medium">{row.actorName}</span>
                <Badge variant="muted" className="font-mono text-[10px]">
                  {row.action}
                </Badge>
                {row.target && (
                  <span className="truncate text-muted-foreground">
                    {row.target}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(row.at, locale)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
