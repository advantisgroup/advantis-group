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
const Track = ({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <div
    role="group"
    aria-label={label}
    className={cn("flex gap-1 rounded-lg bg-muted p-1", className)}
  >
    {children}
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
      "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
      active
        ? "bg-background text-foreground shadow-panel"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

/** DE · EN · ZH · FR, or the languages' own names where there's room for them. */
export const LanguageSwitch = ({
  names = false,
  onSwitch,
  className,
}: {
  names?: boolean;
  onSwitch?: () => void;
  className?: string;
}) => {
  const locale = useLocale();
  const t = useTranslations("nav.settingsMenu");
  const switchLocale = useSwitchLocale();

  return (
    <Track label={t("language")} className={className}>
      {LANGUAGES.map((language) => (
        <SegmentedOption
          key={language.code}
          active={language.code === locale}
          title={language.name}
          onClick={() => {
            onSwitch?.();
            switchLocale(language.code);
          }}
        >
          {names ? (
            <>
              <span className="sm:hidden">{language.code.toUpperCase()}</span>
              <span className="hidden sm:inline">{language.name}</span>
            </>
          ) : (
            language.code.toUpperCase()
          )}
        </SegmentedOption>
      ))}
    </Track>
  );
};

const ThemeIcon = { light: Sun, dark: Moon, system: Monitor } as const;

export const ThemeSwitch = ({
  onSwitch,
  className,
}: {
  onSwitch?: () => void;
  className?: string;
}) => {
  const t = useTranslations("nav.settingsMenu");
  const { setTheme, theme } = useTheme();

  // `theme` is undefined until next-themes has read storage; rendering the
  // active state before then makes the wrong option flash as selected.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <Track label={t("appearance")} className={className}>
      {THEMES.map((mode) => {
        const Icon = ThemeIcon[mode];
        return (
          <SegmentedOption
            key={mode}
            active={mounted && theme === mode}
            title={t(mode)}
            onClick={() => {
              onSwitch?.();
              setTheme(mode);
            }}
          >
            <Icon className="size-3.5" />
            <span>{t(mode)}</span>
          </SegmentedOption>
        );
      })}
    </Track>
  );
};

/**
 * Language and appearance, rendered as two segmented controls.
 *
 * There is no trigger of its own any more: both places that use this — the
 * account menu and the mobile drawer — are already a surface the reader
 * opened, and nesting a second popover inside one to reach two short lists
 * was more chrome than the choices are worth.
 */
export const SettingsMenu = ({ onMobileNavigate }: { onMobileNavigate?: () => void }) => {
  const t = useTranslations("nav.settingsMenu");

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-xs font-medium text-muted-foreground">{t("language")}</span>
        <LanguageSwitch onSwitch={onMobileNavigate} className="mt-2" />
      </div>
      <div>
        <span className="block text-xs font-medium text-muted-foreground">{t("appearance")}</span>
        <ThemeSwitch onSwitch={onMobileNavigate} className="mt-2" />
      </div>
    </div>
  );
};
