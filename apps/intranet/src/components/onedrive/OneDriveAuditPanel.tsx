"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";

/** Read-only "who did what" feed for OneDrive actions. Manager+. */
export function OneDriveAuditPanel() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const rows = useQuery(api.integrations.onedrive.auditFeed, { limit: 100 });

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState inline title={t("noAudit")} />;
  }

  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
      {rows.map((row) => (
        <li key={row._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{row.user?.name ?? "unknown"}</span>{" "}
            <span className="text-muted-foreground">{t(`audit_${row.action}`)}</span>
            {row.target && (
              <span className="ml-1 truncate text-muted-foreground">· {row.target}</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDateTime(row.at, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
