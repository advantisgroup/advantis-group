"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ChevronRight, Sparkles, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { cn } from "@/lib/utils";

const TYPE_STYLE = {
  incident: {
    icon: AlertTriangle,
    className: "bg-yellow-400 text-black",
    chipClassName: "bg-black/10",
  },
  maintenance: {
    icon: Wrench,
    className: "bg-yellow-400 text-black",
    chipClassName: "bg-black/10",
  },
  changelog: {
    icon: Sparkles,
    className: "bg-zinc-900 text-white",
    chipClassName: "bg-white/15",
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
  const { top, moreCount } = active;
  // Don't tell someone about the thing they're already reading.
  if (pathname === `/updates/${top._id}`) return null;
  const { icon: Icon, className, chipClassName } = TYPE_STYLE[top.type];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center px-10 py-2 print:hidden",
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
        {moreCount > 0 ? (
          <span
            className={cn("shrink-0 px-2 py-0.5 text-xs font-semibold", chipClassName)}
          >
            +{moreCount} {t("more")}
          </span>
        ) : null}
        <ChevronRight className="size-4 shrink-0 opacity-70" />
      </Link>
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
