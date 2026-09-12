"use client";

import { useSyncExternalStore, useTransition } from "react";

import { useRouter } from "next/navigation";

import { useLocale, useTranslations } from "next-intl";

import { LocaleFlag } from "@/components/icons/flags";
import { useTheme } from "@/components/theme/theme-provider";
import { type Locale, locales } from "@/i18n/config";
import { setLocale } from "@/i18n/locale-action";
import { cn } from "@/lib/utils";

/** Theme is only known on the client; anything that highlights the active
 * one waits for mount, or the server render and the first client render
 * disagree. */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Switches the interface language and re-renders the server components that
 * already picked their strings. */
export function useLocaleSwitch() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return { current, choose, pending };
}

/** Each language named in its own language — someone looking for "their"
 * option shouldn't have to read it in a language they may not have. */
const LANGUAGE_NAME: Record<Locale, string> = { de: "Deutsch", en: "English" };

export function LanguagePicker() {
  const t = useTranslations("Settings");
  const { current, choose, pending } = useLocaleSwitch();

  return (
    <div
      role="radiogroup"
      aria-label={t("language")}
      className="inline-flex rounded-lg border border-border bg-background p-0.5"
    >
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => choose(locale)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-60",
              active
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LocaleFlag locale={locale} />
            {LANGUAGE_NAME[locale]}
          </button>
        );
      })}
    </div>
  );
}

type Swatch = { ground: string; card: string; line: string; border: string };

/** Fixed colours, not the live tokens — the Light preview has to look light
 * while you're sitting in dark mode, or it previews nothing. Taken from the
 * two palettes in globals.css. */
const SWATCH: Record<"light" | "dark", Swatch> = {
  light: {
    ground: "oklch(97.6% 0.012 86)",
    card: "oklch(99.4% 0.005 86)",
    line: "oklch(68% 0.015 70)",
    border: "oklch(90% 0.014 80)",
  },
  dark: {
    ground: "rgb(22 21 20)",
    card: "rgb(38 38 36)",
    line: "rgb(128 125 118)",
    border: "rgb(58 56 53)",
  },
};
const ACCENT = "oklch(0.6441 0.2026 14)";

/** A window in miniature: a surface, two lines of text, the accent. */
function Preview({ swatch }: { swatch: Swatch }) {
  return (
    <span className="absolute inset-0 block p-2.5" style={{ background: swatch.ground }}>
      <span
        className="relative flex size-full flex-col gap-1.5 rounded-lg border p-2.5"
        style={{ background: swatch.card, borderColor: swatch.border }}
      >
        <span className="block h-1 w-2/5 rounded-full" style={{ background: swatch.line }} />
        <span className="block h-1 w-1/4 rounded-full" style={{ background: swatch.line }} />
        <span
          className="absolute bottom-2.5 right-2.5 block size-3 rounded-full"
          style={{ background: ACCENT }}
        />
      </span>
    </span>
  );
}

const MODES = ["light", "dark", "system"] as const;

/**
 * Appearance as three previews of what you'd get, not three glyphs to decode —
 * the pattern Claude's own settings use. System is both, split on the
 * diagonal, because that's exactly what it is: whichever your device says.
 */
export function AppearancePicker() {
  const t = useTranslations("Settings");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div role="radiogroup" aria-label={t("appearance")} className="grid grid-cols-3 gap-3 sm:gap-4">
      {MODES.map((mode) => {
        const active = mounted && theme === mode;
        const label =
          mode === "light" ? t("themeLight") : mode === "dark" ? t("themeDark") : t("themeSystem");
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(mode)}
            className="group flex min-w-0 flex-col items-center gap-2 outline-none"
          >
            <span
              className={cn(
                "relative block aspect-[3/2] w-full overflow-hidden rounded-xl border transition-[box-shadow,border-color]",
                "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
                active
                  ? "border-transparent ring-2 ring-signal ring-offset-2 ring-offset-background"
                  : "border-border/70 group-hover:border-border",
              )}
            >
              {mode === "system" ? (
                <>
                  <Preview swatch={SWATCH.light} />
                  <span
                    className="absolute inset-0 block"
                    style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                  >
                    <Preview swatch={SWATCH.dark} />
                  </span>
                </>
              ) : (
                <Preview swatch={SWATCH[mode]} />
              )}
            </span>
            <span
              className={cn(
                "text-[13px] font-medium transition-colors",
                active ? "text-signal" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
