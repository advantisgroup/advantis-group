"use client";

import React from "react";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { ClerkAuthControls } from "@/components/auth/ClerkAuthControls";
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
}

export const SettingsMenu = ({ isMobile = false }: SettingsMenuProps) => {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();
  const t = useTranslations("nav");

  const [isOpen, setIsOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const switchLanguage = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  if (isMobile) {
    return (
      <div className="space-y-5">
        <ClerkAuthControls isMobile />
        <div className="space-y-3">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Language
          </span>
          <div className="grid grid-cols-2 gap-2">
            {languages.map(language => (
              <button
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200",
                  language.code === locale
                    ? "border-advantis/40 bg-advantis/10 text-advantis"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-base">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Appearance
          </span>
          <div className="grid grid-cols-1 gap-2">
            {['light', 'dark', 'system'].map(mode => {
              const Icon =
                mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

              return (
                <button
                  disabled={mode === 'light' || mode === 'system'}
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200',
                    mounted && theme === mode
                      ? 'border-advantis/40 bg-advantis/10 text-advantis'
                      : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="capitalize">
                    {mode === 'system' ? 'Auto' : mode}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center p-2 outline-none group/settings"
          aria-label="Settings"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="absolute inset-0 rounded-full bg-advantis/10 opacity-0 blur-md transition-opacity duration-300 group-hover/settings:opacity-100" />

          <div className="relative z-10 flex flex-col items-center justify-center gap-0.75">
            {[0, 1, 2].map(row => (
              <motion.div
                key={row}
                className="flex gap-0.75"
                animate={
                  isOpen
                    ? {
                        y:
                          row === 0
                            ? [-10, 0]
                            : row === 1
                              ? [0, 2, 0]
                              : [0, 4, 0],
                        scale: row === 2 ? [1, 0.8, 1] : 1,
                      }
                    : { y: 0, scale: 1 }
                }
                transition={{ duration: 0.25 }}
              >
                {[0, 1, 2].map(dot => (
                  <motion.span
                    key={dot}
                    className={cn(
                      'block h-1 w-1 rounded-full bg-foreground',
                      isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
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
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-2xl border border-border bg-popover p-3 shadow-md"
        >
          <ClerkAuthControls />

          <DropdownMenuSeparator className="my-3" />

          <DropdownMenuLabel className="mt-1 px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
            Language
          </DropdownMenuLabel>

          <div className="mb-2 mt-2 grid grid-cols-2 gap-2">
            {languages.map(language => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent py-2',
                  language.code === locale &&
                    'border-advantis/30 bg-advantis/10 font-medium text-advantis'
                )}
              >
                <span className="text-lg">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="my-3" />

          <DropdownMenuLabel className="mt-1 px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
            Appearance
          </DropdownMenuLabel>

          <div className="mt-2 flex flex-col gap-2">
            {['light', 'dark', 'system'].map(mode => {
              const Icon =
                mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

              return (
                <DropdownMenuItem
                  disabled={mode === 'light' || mode === 'system'}
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className="cursor-pointer rounded-xl py-2"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span className="capitalize">
                    {mode === 'system' ? 'System' : mode}{' '}
                    {mode === 'light'
                      ? '(Disabled)'
                      : mode === 'system'
                        ? '(Disabled)'
                        : ''}
                  </span>
                  {mounted && theme === mode && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-advantis" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
