"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

export const MAX_FAVORITES = 12;

/** Stars the current page for the sidebar's Favourites list. Sits next to
 *  the page title, so every page that has one can be starred. */
export function FavoriteToggle({ title }: { title: string }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const prefs = useQuery(api.people.preferences.getMine);
  const setPrefs = useMutation(api.people.preferences.setMine);
  const handleError = useErrorHandler();
  if (prefs === undefined) return null;
  const favorites = prefs?.favoritePages ?? [];
  const active = favorites.some((f) => f.href === pathname);

  async function toggle() {
    const next = active
      ? favorites.filter((f) => f.href !== pathname)
      : [...favorites, { href: pathname, label: title }];
    if (!active && next.length > MAX_FAVORITES) {
      toast.error(t("favoritesFull", { max: MAX_FAVORITES }));
      return;
    }
    try {
      await setPrefs({ favoritePages: next });
    } catch (e) {
      handleError(e);
    }
  }

  const label = active ? t("favoriteRemove") : t("favoriteAdd");
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "shrink-0 rounded p-0.5 transition-colors",
        active ? "text-warn" : "text-muted-foreground/60 hover:text-foreground",
      )}
    >
      <Star className={cn("size-3.5", active && "fill-current")} />
    </button>
  );
}
