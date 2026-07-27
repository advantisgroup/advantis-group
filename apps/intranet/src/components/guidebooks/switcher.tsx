"use client";

import { ArrowLeft, ArrowRight, Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { accessibleGuidebooks, type Guidebook } from "./registry";

/**
 * Compact dropdown to jump between guidebooks without going back to the
 * list. Rendered in the detail page header on desktop; on mobile the
 * bottom `GuidebookPager` covers switching instead. Only guidebooks the
 * current user may access are listed; hidden entirely when there is
 * nothing to switch to.
 */
export function GuidebookSwitcher({ current }: { current: Guidebook }) {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);

  if (guidebooks.length < 2) return null;

  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("switcher.label")}
        className="flex max-w-64 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <CurrentIcon className="size-4 shrink-0 text-primary" />
        <span className="truncate">{t(current.titleKey)}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {guidebooks.map((gb) => {
          const Icon = gb.icon;
          const isCurrent = gb.slug === current.slug;
          return (
            <DropdownMenuItem key={gb.slug} asChild>
              <Link
                href={`/guidebooks/${gb.slug}`}
                className={cn("flex items-center gap-2.5", isCurrent && "bg-accent")}
              >
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{t(gb.titleKey)}</span>
                {isCurrent && <Check className="size-4 shrink-0 text-muted-foreground" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Docs-style previous/next footer, shown under the guidebook content on
 * every screen size — on mobile it is the primary way to move between
 * guidebooks. Neighbours follow registry order, filtered to what the
 * user may access.
 */
export function GuidebookPager({ current }: { current: Guidebook }) {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);

  const index = guidebooks.findIndex((gb) => gb.slug === current.slug);
  const prev = index > 0 ? guidebooks[index - 1] : undefined;
  const next = index >= 0 ? guidebooks[index + 1] : undefined;

  if (!prev && !next) return null;

  return (
    <nav className="mt-10 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/guidebooks/${prev.slug}`}
          className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            {t("switcher.previous")}
          </span>
          <span className="truncate text-sm font-semibold">{t(prev.titleKey)}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next && (
        <Link
          href={`/guidebooks/${next.slug}`}
          className="group flex flex-col items-end gap-1 rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {t("switcher.next")}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="max-w-full truncate text-sm font-semibold">{t(next.titleKey)}</span>
        </Link>
      )}
    </nav>
  );
}
