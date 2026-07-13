"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_STYLE = {
  incident: {
    icon: AlertTriangle,
    className: "bg-yellow-400 text-black",
    chipClassName: "bg-black/10 hover:bg-black/15",
    // Left-edge gradient wash for the "+N more" list rows below — the top
    // bar itself is already solidly colored, but those plain rows need
    // their own per-type cue to scan at a glance.
    rowClassName: "bg-gradient-to-r from-destructive/15 to-transparent",
  },
  maintenance: {
    icon: Wrench,
    className: "bg-yellow-400 text-black",
    chipClassName: "bg-black/10 hover:bg-black/15",
    rowClassName: "bg-gradient-to-r from-amber-500/15 to-transparent",
  },
  changelog: {
    icon: Sparkles,
    // Same blue accent used for info/highlight treatments elsewhere in the
    // app (chat mentions, tour highlights, file folders) — solid so it reads
    // the same in light and dark mode, unlike a dark-gray bar.
    className: "bg-blue-500 text-white",
    chipClassName: "bg-white/15 hover:bg-white/20",
    rowClassName: "bg-gradient-to-r from-blue-500/15 to-transparent",
  },
} as const;

/**
 * Slim top-of-page banner for the current highest-priority Update (incident
 * > maintenance > changelog) — flat, full-width, no rounding, always visible
 * above the scrollable content (not position:sticky, just structurally above
 * <main>). Replaces the one-shot WhatsNewDialog for changelog announcements.
 */
export function UpdateBanner() {
  const t = useTranslations("Updates");
  const pathname = usePathname();
  const active = useQuery(api.updates.bannerActive);
  const dismiss = useMutation(api.updates.dismissBanner);

  if (!active?.top) return null;
  const { top, moreCount, others } = active;
  // Don't tell someone about the thing they're already reading.
  if (pathname === `/updates/${top._id}`) return null;
  const { icon: Icon, className, chipClassName } = TYPE_STYLE[top.type];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center gap-2 px-10 py-2 print:hidden",
        className
      )}
    >
      <Link
        href={`/updates/${top._id}`}
        className="flex min-w-0 items-center gap-2"
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 truncate text-sm font-medium">
          {top.title}
          {top.summary ? (
            <span className="opacity-80"> — {top.summary}</span>
          ) : null}
        </span>
        <ChevronRight className="size-4 shrink-0 opacity-70" />
      </Link>

      {moreCount > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-1 px-2 py-0.5 text-xs font-semibold transition-colors",
                chipClassName
              )}
            >
              +{moreCount} {t("more")}
              <ChevronDown className="size-3 transition-transform data-[state=open]:rotate-180" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={8} className="w-64 p-1">
            <div className="space-y-0.5">
              {others.map(u => {
                const { icon: OtherIcon, rowClassName } = TYPE_STYLE[u.type];
                return (
                  <Link
                    key={u._id}
                    href={`/updates/${u._id}`}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
                      rowClassName
                    )}
                  >
                    <OtherIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{u.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(u.publishedAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          void dismiss({ updateId: top._id });
        }}
        className="absolute right-2 shrink-0 p-1 opacity-70 transition-opacity hover:opacity-100 md:right-4"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
