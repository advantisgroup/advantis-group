"use client";

import React from "react";

import { motion } from "framer-motion";
import { ChevronUp, Monitor, Moon, Settings2, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const languages = [
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
];

interface SettingsMenuProps {
  isMobile?: boolean;
  onMobileNavigate?: () => void;
  /**
   * Render the controls directly rather than behind a trigger. The header's
   * card menu is already a popover, and nesting a second one inside it to
   * reach two short lists is more chrome than the choices are worth.
   */
  inline?: boolean;
}

export const SettingsMenu = ({
  isMobile = false,
  onMobileNavigate,
  inline = false,
}: SettingsMenuProps) => {
  const locale = useLocale();
  const t = useTranslations("nav.settingsMenu");
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();

  const [isOpen, setIsOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const switchLanguage = (newLocale: string) => {
    onMobileNavigate?.();
    router.replace(pathname, { locale: newLocale });
  };

  if (inline) {
    return (
      <div className="space-y-5">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {t("language")}
          </span>
          <div className="mt-3 flex gap-2">
            {languages.map((language) => (
              <button
                type="button"
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                aria-current={language.code === locale}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2.5 text-sm transition-colors",
                  language.code === locale
                    ? "border-foreground bg-foreground text-background"
                    : "border-rule text-muted-foreground hover:border-rule-strong hover:text-foreground",
                )}
              >
                <span className="text-base">{language.flag}</span>
                <span className="font-mono text-[11px]">{language.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {t("appearance")}
          </span>
          <div className="mt-3 flex gap-2">
            {["light", "dark", "system"].map((mode) => {
              const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
              const label =
                mode === "light" ? t("light") : mode === "dark" ? t("dark") : t("system");
              const isActive = mounted && theme === mode;

              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setTheme(mode)}
                  aria-current={isActive}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-md border py-2.5 text-sm transition-colors",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-rule text-muted-foreground hover:border-rule-strong hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between rounded-2xl border border-border bg-card/70 px-4 py-3 text-left transition-all duration-200 hover:border-advantis/30 hover:bg-card"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-advantis/15 text-advantis">
                <Settings2 className="h-4 w-4" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{t("label")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("language")} & {t("appearance")}
                </p>
              </div>
            </div>
            <ChevronUp className="h-4 w-4 rotate-90 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("label")}</DrawerTitle>
            <DrawerDescription>
              {t("language")} & {t("appearance")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-5 overflow-y-auto px-5 pb-6 pt-1">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut", delay: 0.03 }}
              className="space-y-3"
            >
              <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                {t("language")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {languages.map((language) => (
                  <DrawerClose asChild key={language.code}>
                    <button
                      onClick={() => switchLanguage(language.code)}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200",
                        language.code === locale
                          ? "border-advantis/40 bg-advantis/10 text-advantis"
                          : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-base">{language.flag}</span>
                      <span>{language.code.toUpperCase()}</span>
                    </button>
                  </DrawerClose>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut", delay: 0.07 }}
              className="space-y-3"
            >
              <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                {t("appearance")}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {["light", "dark", "system"].map((mode) => {
                  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

                  return (
                    <DrawerClose asChild key={mode}>
                      <button
                        onClick={() => {
                          onMobileNavigate?.();
                          setTheme(mode);
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200",
                          mounted && theme === mode
                            ? "border-advantis/40 bg-advantis/10 text-advantis"
                            : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="capitalize">
                          {mode === "light" ? t("light") : mode === "dark" ? t("dark") : t("auto")}
                        </span>
                      </button>
                    </DrawerClose>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center p-2 outline-none group/settings"
          aria-label={t("label")}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="absolute inset-0 rounded-full bg-advantis/10 opacity-0 blur-md transition-opacity duration-300 group-hover/settings:opacity-100" />

          <div className="relative z-10 flex flex-col items-center justify-center gap-0.75">
            {[0, 1, 2].map((row) => (
              <motion.div
                key={row}
                className="flex gap-0.75"
                animate={
                  isOpen
                    ? {
                        y: row === 0 ? [-10, 0] : row === 1 ? [0, 2, 0] : [0, 4, 0],
                        scale: row === 2 ? [1, 0.8, 1] : 1,
                      }
                    : { y: 0, scale: 1 }
                }
                transition={{ duration: 0.25 }}
              >
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className={cn(
                      "block h-1 w-1 rounded-full bg-foreground",
                      isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                    )}
                    animate={{
                      x:
                        dot === 0
                          ? isHovered || isOpen
                            ? 7
                            : 0
                          : dot === 2
                            ? isHovered || isOpen
                              ? -7
                              : 0
                            : 0,
                    }}
                    transition={{ duration: 0.2 }}
                  />
                ))}
              </motion.div>
            ))}
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-72 overflow-hidden border-none bg-transparent p-0 shadow-none"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="rounded-2xl border border-border bg-popover p-3 shadow-md"
        >
          <DropdownMenuLabel className="mt-1 px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
            {t("language")}
          </DropdownMenuLabel>

          <div className="mb-2 mt-2 grid grid-cols-2 gap-2">
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent py-2",
                  language.code === locale &&
                    "border-advantis/30 bg-advantis/10 font-medium text-advantis",
                )}
              >
                <span className="text-lg">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="my-3" />

          <DropdownMenuLabel className="mt-1 px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
            {t("appearance")}
          </DropdownMenuLabel>

          <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-muted/10 p-1">
            {["light", "dark", "system"].map((mode) => {
              const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
              const label =
                mode === "light" ? t("light") : mode === "dark" ? t("dark") : t("system");
              const isActive = mounted && theme === mode;

              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setTheme(mode)}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-xl border text-muted-foreground transition-all duration-200",
                    isActive
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent bg-transparent hover:border-border/60 hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
