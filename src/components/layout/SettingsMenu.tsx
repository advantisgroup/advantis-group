"use client";

import React from "react";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

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

  const [isOpen, setIsOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const switchLanguage = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  /* ---------------- MOBILE VERSION ---------------- */

  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Language */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider block">
            Language
          </span>
          <div className="flex gap-2 flex-wrap">
            {languages.map(language => (
              <button
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-all duration-200",
                  language.code === locale
                    ? "bg-advantis/20 text-advantis font-medium ring-1 ring-advantis/30"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-base">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider block">
            Appearance
          </span>

          <div className="flex gap-2">
            {["light", "dark", "system"].map(mode => {
              const Icon =
                mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

              return (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={cn(
                    "p-2 rounded-md transition-all duration-200 flex items-center gap-1.5",
                    mounted && theme === mode
                      ? "bg-advantis/20 text-advantis ring-1 ring-advantis/30"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm capitalize">
                    {mode === "system" ? "Auto" : mode}
                  </span>
                </button>
              );
            })}
          </div >
        </div >
      </div >
    );
  }

  /* ---------------- DESKTOP VERSION ---------------- */

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 relative group/settings outline-none w-10 h-10 flex items-center justify-center"
          aria-label="Settings"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="absolute inset-0 opacity-0 group-hover/settings:opacity-100 transition-opacity duration-300 blur-md bg-advantis/10 rounded-full" />

          <div className="flex flex-col gap-0.75 items-center justify-center relative z-10">
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
                      "block w-1 h-1 rounded-full bg-foreground",
                      isOpen
                        ? "bg-advantis"
                        : "group-hover/settings:bg-advantis"
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
        className="w-56 p-0 overflow-hidden border-none bg-transparent shadow-none"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="bg-popover border border-border rounded-md p-2 shadow-md"
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider">
            Language
          </DropdownMenuLabel>

          <div className="grid grid-cols-2 gap-1 mb-2">
            {languages.map(language => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "cursor-pointer flex items-center justify-center gap-2",
                  language.code === locale &&
                  "bg-accent text-accent-foreground font-medium"
                )}
              >
                <span className="text-lg">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider mt-2">
            Appearance
          </DropdownMenuLabel>

          <div className="flex flex-col gap-1">
            {["light", "dark", "system"].map(mode => {
              const Icon =
                mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

              return (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span className="capitalize">
                    {mode === "system" ? "System" : mode}
                  </span>
                  {mounted && theme === mode && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
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
