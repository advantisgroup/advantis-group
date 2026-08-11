"use client";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";

import { useIsAdmin } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

/**
 * Guided "getting started" checklist for admins. Derived from the existing
 * dashboard queries (no new backend surface), it links each unfinished step to
 * the page that fixes it — so a non-technical admin can stand the system up (and
 * verify it) without a developer. Renders nothing once everything's done, or for
 * non-admins.
 */
export function SetupChecklist() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();

  // Admin-only queries: skip them entirely for non-admins.
  const args = isAdmin ? {} : "skip";
  const devices = useQuery(api.activity.devices.list, args);
  const people = useQuery(api.activity.people.list, args);
  const debugPwSet = useQuery(api.activity.settings.debugPasswordIsSet, args);

  if (!isAdmin) return null;
  if (devices === undefined || people === undefined || debugPwSet === undefined) {
    return null;
  }

  const items = [
    {
      id: "approve",
      done: devices.some((d) => d.status === "active"),
      href: "/activity/devices",
    },
    {
      id: "people",
      done: people.length > 0,
      href: "/activity/people",
    },
    {
      id: "link",
      done: devices.some((d) => d.personId != null),
      href: "/activity/devices",
    },
    { id: "debugpw", done: debugPwSet, href: "/activity/settings" },
  ];
  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null; // fully set up — don't nag.

  return (
    <Card className="animate-fade-up border-signal/30 bg-signal/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-fg">{t("setup.title")}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("setup.remaining", { count: remaining })}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("setup.subtitle")}</p>
        <ul className="mt-3 space-y-1">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={i.href}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2"
              >
                {i.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "text-sm",
                    i.done ? "text-muted-foreground line-through" : "text-fg",
                  )}
                >
                  {t(`setup.item.${i.id}`)}
                </span>
                {!i.done && (
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-signal" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
