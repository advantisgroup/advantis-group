"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ChevronRight, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { ADMIN_NAV_GROUPS } from "@/components/layout/AdminSidebar";
import { Link } from "@/components/Link";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";

import { Panel, PanelSkeleton } from "./primitives";

/** Admins only — `auditLog.list` itself requires admin, so a manager gets no
 * empty shell here, the section just isn't rendered. */
export function AuditFeed() {
  const t = useTranslations("Admin");
  const rows = useQuery(api.org.auditLog.list, { limit: 8 });

  return (
    <Panel
      icon={<ScrollText />}
      title={t("overview.audit.title")}
      description={t("overview.audit.hint")}
      bodyClassName="p-3"
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/audit">{t("overview.open")}</Link>
        </Button>
      }
    >
      {rows === undefined ? (
        <PanelSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          {t("overview.audit.empty")}
        </p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <Link
              key={row._id}
              href={`/admin/audit?entry=${row._id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight">
                  <span className="font-medium">
                    {row.user?.name ?? t("overview.audit.unknown")}
                  </span>
                  <span className="text-muted-foreground"> · {row.action}</span>
                </span>
                {row.target && (
                  <span className="block truncate text-xs leading-tight text-muted-foreground">
                    {row.target}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(row.at)}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Compact index of the whole admin area, built from the sidebar's own config so
 * it can't drift out of sync with what the nav actually offers. Deliberately at
 * the bottom and deliberately plain — this is the "I know where I'm going"
 * escape hatch, not the content of the page. It used to *be* the page.
 */
export function JumpTo() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  const items = ADMIN_NAV_GROUPS.filter((g) => g.labelKey !== "nav.groupGeneral")
    .flatMap((g) => g.items)
    .filter((item) => (!item.managerOnly || isManager) && (!item.adminOnly || isAdmin));

  return (
    <Panel title={t("overview.jumpTo")} description={t("overview.jumpToHint")} bodyClassName="p-3">
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent"
          >
            <item.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{t(item.labelKey)}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Panel>
  );
}
