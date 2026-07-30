"use client";

import { useSyncExternalStore, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Monitor, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { LocaleFlag } from "@/components/icons/flags";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Locale, locales } from "@/i18n/config";
import { setLocale } from "@/i18n/locale-action";
import { cn } from "@/lib/utils";

const MODES = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Monitor },
] as const;

/**
 * Combined language + appearance control. Icon-first (flags + theme glyphs)
 * so it stays compact on mobile — ported from the marketing site's settings
 * menu, adapted to the intranet's locale action and primitives.
 */
export function SettingsMenu({ className }: { className?: string }) {
  const t = useTranslations("Settings");
  const current = useLocale() as Locale;
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  // Theme is only known on the client; gate the active highlight on mount to
  // avoid a hydration mismatch (without a setState-in-effect).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("preferences")} className={className}>
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-3">
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("language")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {locales.map((locale) => (
            <button
              key={locale}
              type="button"
              disabled={pending}
              onClick={() => choose(locale)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                locale === current
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <LocaleFlag locale={locale} />
              {locale.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="my-3 h-px bg-border/70" />

        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("appearance")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ key, icon: Icon }) => {
            const active = mounted && theme === key;
            const label =
              key === "light"
                ? t("themeLight")
                : key === "dark"
                  ? t("themeDark")
                  : t("themeSystem");
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                aria-label={label}
                title={label}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg border transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
