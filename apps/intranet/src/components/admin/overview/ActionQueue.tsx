"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronRight, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Panel, PanelSkeleton } from "./primitives";
import { QUEUE_META, QUEUE_ORDER } from "./streams";

/**
 * Everything waiting on a human, in one list, so a manager can answer "does
 * anything need me today?" without opening nine subpages.
 *
 * Rows are ordered by consequence, not by count (see `QUEUE_ORDER`) — one
 * access request means somebody cannot sign in at all, which outranks forty
 * open suggestions. The queue only renders buckets that are non-empty; an
 * all-clear is a real, common state and gets a real empty state rather than a
 * wall of zeroes.
 */
export function ActionQueue() {
  const t = useTranslations("Admin");
  const data = useQuery(api.org.overview.queue);

  const items = data
    ? [...data.items].sort((a, b) => QUEUE_ORDER.indexOf(a.key) - QUEUE_ORDER.indexOf(b.key))
    : [];

  return (
    <Panel
      icon={<Inbox />}
      title={t("overview.queue.title")}
      description={t("overview.queue.hint")}
      action={
        data && data.total > 0 ? (
          <p className="pt-1.5 text-xs font-medium tabular-nums text-muted-foreground">
            {t("overview.queue.waiting", { count: data.total })}
            {data.overdue > 0 && (
              <span className="text-warn">
                {" · "}
                {t("overview.queue.overdue", { count: data.overdue })}
              </span>
            )}
          </p>
        ) : null
      }
      bodyClassName="p-2"
    >
      {data === undefined ? (
        <div className="p-2">
          <PanelSkeleton rows={4} />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-ok/12 text-ok">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="text-sm font-medium">{t("overview.queue.clearTitle")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("overview.queue.clearBody")}</p>
        </div>
      ) : (
        <div className="grid gap-x-2 sm:grid-cols-2">
          {items.map((entry) => {
            const meta = QUEUE_META[entry.key];
            if (!meta) return null;
            const urgent = entry.overdue > 0;
            return (
              <Link
                key={entry.key}
                href={meta.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset [&_svg]:size-4",
                    urgent
                      ? "bg-warn/12 text-warn ring-warn/25"
                      : "bg-panel-2 text-muted-foreground ring-border",
                  )}
                >
                  <meta.icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {t(`overview.queue.${meta.labelKey}`)}
                  </p>
                  <p className="truncate text-xs leading-tight text-muted-foreground">
                    {entry.oldestAt
                      ? t("overview.queue.oldest", { age: relativeTime(entry.oldestAt) })
                      : null}
                    {urgent && (
                      <span className="text-warn">
                        {" · "}
                        {t("overview.queue.overdue", { count: entry.overdue })}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-semibold leading-none tabular-nums">
                  {entry.count}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
