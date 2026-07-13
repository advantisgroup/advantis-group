"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Sparkles, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";

const TYPE_ICON = {
  incident: AlertTriangle,
  maintenance: Wrench,
  changelog: Sparkles,
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
  const Icon = TYPE_ICON[top.type];

  return (
    <div className="flex items-center gap-2 bg-yellow-400 px-3 py-2 text-black print:hidden md:px-4">
      <Link
        href={`/updates/${top._id}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 truncate text-sm font-medium">
          {top.title}
          {top.summary ? (
            <span className="font-normal opacity-80"> — {top.summary}</span>
          ) : null}
        </span>
        {moreCount > 0 ? (
          <span className="shrink-0 bg-black/10 px-2 py-0.5 text-xs font-semibold">
            +{moreCount} {t("more")}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          void dismiss({ updateId: top._id });
        }}
        className="shrink-0 p-1 text-black/70 transition-colors hover:bg-black/10 hover:text-black"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
