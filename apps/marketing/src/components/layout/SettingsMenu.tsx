"use client";

import React from "react";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Language names carry no flag. A flag is not a language, and on Windows the
 * regional-indicator glyphs have no emoji font behind them, so 🇩🇪 rendered as
 * the bare letters "DE" — which is why the old row read "DE DE" and "GB EN".
 */
export const LANGUAGES = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "fr", name: "Français" },
] as const;

/**
 * Same page, other language, same query — a `?redirect_url=` or an open
 * inquiry's `?id=` survives the switch. Read at click time so the header
 * doesn't need useSearchParams (and a Suspense boundary) just for this.
 */
export const useSwitchLocale = () => {
  const router = useRouter();
  const pathname = usePathname();

  return (nextLocale: string) => {
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    router.replace({ pathname, query }, { locale: nextLocale });
  };
};

const THEMES = ["light", "dark", "system"] as const;

/** One segmented control, shared by both groups so they cannot drift apart. */
const Segmented = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span className="block text-xs font-medium text-muted-foreground">{label}</span>
    <div className="mt-2 flex gap-1 rounded-lg bg-muted p-1">{children}</div>
  </div>
);

const SegmentedOption = ({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={cn(
      "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors",
      active
        ? "bg-background text-foreground shadow-panel"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

/**
 * Language and appearance, rendered as two segmented controls.
 *
 * There is no trigger of its own any more: both places that use this — the
 * account menu and the mobile drawer — are already a surface the reader
 * opened, and nesting a second popover inside one to reach two short lists
 * was more chrome than the choices are worth.
 */
export const SettingsMenu = ({ onMobileNavigate }: { onMobileNavigate?: () => void }) => {
  const locale = useLocale();
  const t = useTranslations("nav.settingsMenu");
  const switchLocale = useSwitchLocale();
  const { setTheme, theme } = useTheme();

  // `theme` is undefined until next-themes has read storage; rendering the
  // active state before then makes the wrong option flash as selected.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const switchLanguage = (nextLocale: string) => {
    onMobileNavigate?.();
    switchLocale(nextLocale);
  };

  const themeLabel = { light: t("light"), dark: t("dark"), system: t("system") } as const;
  const ThemeIcon = { light: Sun, dark: Moon, system: Monitor } as const;

  return (
    <div className="space-y-4">
      <Segmented label={t("language")}>
        {LANGUAGES.map((language) => (
          <SegmentedOption
            key={language.code}
            active={language.code === locale}
            title={language.name}
            onClick={() => switchLanguage(language.code)}
          >
            {language.code.toUpperCase()}
          </SegmentedOption>
        ))}
      </Segmented>

      <Segmented label={t("appearance")}>
        {THEMES.map((mode) => {
          const Icon = ThemeIcon[mode];
          return (
            <SegmentedOption
              key={mode}
              active={mounted && theme === mode}
              title={themeLabel[mode]}
              onClick={() => {
                onMobileNavigate?.();
                setTheme(mode);
              }}
            >
              <Icon className="size-3.5" />
              <span>{themeLabel[mode]}</span>
            </SegmentedOption>
          );
        })}
      </Segmented>
    </div>
  );
};
