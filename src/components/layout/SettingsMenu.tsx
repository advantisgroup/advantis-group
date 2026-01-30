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

<<<<<<< HEAD
    // Mobile-specific inline layout
    if (isMobile) {
        return (
            <div className="space-y-4">
                {/* Language Section */}
                <div className="space-y-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block">Language</span>
                    <div className="flex gap-2 flex-wrap">
                        {languages.map((language) => (
                            <button
                                key={language.code}
                                onClick={() => switchLanguage(language.code)}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-all duration-200',
                                    language.code === locale
                                        ? 'bg-advantis/20 text-advantis font-medium ring-1 ring-advantis/30'
                                        : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <span className="text-base">{language.flag}</span>
                                <span>{language.code.toUpperCase()}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Theme Section */}
                <div className="space-y-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block">Appearance</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTheme('light')}
                            className={cn(
                                'p-2 rounded-md transition-all duration-200 flex items-center gap-1.5',
                                mounted && theme === 'light'
                                    ? 'bg-advantis/20 text-advantis ring-1 ring-advantis/30'
                                    : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                            )}
                            aria-label="Light mode"
                        >
                            <Sun className="h-4 w-4" />
                            <span className="text-sm">Light</span>
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={cn(
                                'p-2 rounded-md transition-all duration-200 flex items-center gap-1.5',
                                mounted && theme === 'dark'
                                    ? 'bg-advantis/20 text-advantis ring-1 ring-advantis/30'
                                    : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                            )}
                            aria-label="Dark mode"
                        >
                            <Moon className="h-4 w-4" />
                            <span className="text-sm">Dark</span>
                        </button>
                        <button
                            onClick={() => setTheme('system')}
                            className={cn(
                                'p-2 rounded-md transition-all duration-200 flex items-center gap-1.5',
                                mounted && theme === 'system'
                                    ? 'bg-advantis/20 text-advantis ring-1 ring-advantis/30'
                                    : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                            )}
                            aria-label="System theme"
                        >
                            <Monitor className="h-4 w-4" />
                            <span className="text-sm">Auto</span>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Desktop dropdown layout
=======
  // Mobile-specific inline layout
  if (isMobile) {
>>>>>>> 37a6b46f1babd9e82dbe7b959d1555cc642d712e
    return (
      <div className="space-y-4">
        {/* Language Section */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider block">
            Language
          </span>
          <div className="flex gap-2 flex-wrap">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-all duration-200",
                  language.code === locale
                    ? "bg-advantis/20 text-advantis font-medium ring-1 ring-advantis/30"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-base">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

<<<<<<< HEAD
                    <div className="flex flex-col gap-[3px] items-center justify-center relative z-10 h-full w-full">
                        {/* Row 1 (Top) */}
                        <motion.div
                            className="flex gap-[3px]"
                            animate={
                                isOpen
                                    ? {
                                          y: [-10, 0], // Jump up 10px then slam down to 0
                                      }
                                    : {
                                          y: 0,
                                      }
                            }
                            transition={
                                isOpen
                                    ? {
                                          duration: 0.3,
                                          times: [0, 1],
                                          type: 'spring',
                                          stiffness: 300,
                                          damping: 15,
                                      }
                                    : { duration: 0.2 }
                            }
                        >
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                        </motion.div>

                        {/* Row 2 (Middle) */}
                        <motion.div
                            className="flex gap-[3px]"
                            animate={
                                isOpen
                                    ? {
                                          y: [0, 2, 0],
                                      }
                                    : {
                                          y: 0,
                                      }
                            }
                            transition={
                                isOpen
                                    ? {
                                          delay: 0.15,
                                          duration: 0.2,
                                      }
                                    : { duration: 0.2 }
                            }
                        >
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis opacity-80' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis opacity-80' : 'group-hover/settings:bg-advantis'
                                )}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis opacity-80' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                        </motion.div>

                        {/* Row 3 (Bottom) */}
                        <motion.div
                            className="flex gap-[3px]"
                            animate={
                                isOpen
                                    ? {
                                          y: [0, 4, 0],
                                          scale: [1, 0.8, 1],
                                      }
                                    : {
                                          y: 0,
                                          scale: 1,
                                      }
                            }
                            transition={
                                isOpen
                                    ? {
                                          delay: 0.25,
                                          duration: 0.3,
                                      }
                                    : { duration: 0.2 }
                            }
                        >
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                            />
                            <motion.span
                                className={cn(
                                    'block w-1 h-1 rounded-full bg-foreground',
                                    isOpen ? 'bg-advantis' : 'group-hover/settings:bg-advantis'
                                )}
                                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                                transition={{ duration: 0.2 }}
                            />
                        </motion.div>
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-56 p-0 overflow-hidden border-none bg-transparent shadow-none"
=======
        {/* Theme Section */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider block">
            Appearance
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "p-2 rounded-md transition-all duration-200 flex items-center gap-1.5",
                mounted && theme === "light"
                  ? "bg-advantis/20 text-advantis ring-1 ring-advantis/30"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
              aria-label="Light mode"
>>>>>>> 37a6b46f1babd9e82dbe7b959d1555cc642d712e
            >
              <Sun className="h-4 w-4" />
              <span className="text-sm">Light</span>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "p-2 rounded-md transition-all duration-200 flex items-center gap-1.5",
                mounted && theme === "dark"
                  ? "bg-advantis/20 text-advantis ring-1 ring-advantis/30"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
              aria-label="Dark mode"
            >
              <Moon className="h-4 w-4" />
              <span className="text-sm">Dark</span>
            </button>
            <button
              onClick={() => setTheme("system")}
              className={cn(
                "p-2 rounded-md transition-all duration-200 flex items-center gap-1.5",
                mounted && theme === "system"
                  ? "bg-advantis/20 text-advantis ring-1 ring-advantis/30"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
              aria-label="System theme"
            >
              <Monitor className="h-4 w-4" />
              <span className="text-sm">Auto</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop dropdown layout
  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 relative group/settings outline-none w-10 h-10 flex items-center justify-center"
          aria-label="Settings"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Subtle hover glow */}
          <div className="absolute inset-0 opacity-0 group-hover/settings:opacity-100 transition-opacity duration-300 blur-md bg-advantis/10 rounded-full" />

          <div className="flex flex-col gap-[3px] items-center justify-center relative z-10 h-full w-full">
            {/* Row 1 (Top) */}
            <motion.div
              className="flex gap-[3px]"
              animate={
                isOpen
                  ? {
                      y: [-10, 0], // Jump up 10px then slam down to 0
                    }
                  : {
                      y: 0,
                    }
              }
              transition={
                isOpen
                  ? {
                      duration: 0.3,
                      times: [0, 1],
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                    }
                  : { duration: 0.2 }
              }
            >
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                transition={{ duration: 0.2 }}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>

            {/* Row 2 (Middle) */}
            <motion.div
              className="flex gap-[3px]"
              animate={
                isOpen
                  ? {
                      y: [0, 2, 0],
                    }
                  : {
                      y: 0,
                    }
              }
              transition={
                isOpen
                  ? {
                      delay: 0.15,
                      duration: 0.2,
                    }
                  : { duration: 0.2 }
              }
            >
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen
                    ? "bg-advantis opacity-80"
                    : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                transition={{ duration: 0.2 }}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen
                    ? "bg-advantis opacity-80"
                    : "group-hover/settings:bg-advantis",
                )}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen
                    ? "bg-advantis opacity-80"
                    : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>

            {/* Row 3 (Bottom) */}
            <motion.div
              className="flex gap-[3px]"
              animate={
                isOpen
                  ? {
                      y: [0, 4, 0],
                      scale: [1, 0.8, 1],
                    }
                  : {
                      y: 0,
                      scale: 1,
                    }
              }
              transition={
                isOpen
                  ? {
                      delay: 0.25,
                      duration: 0.3,
                    }
                  : { duration: 0.2 }
              }
            >
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? 7 : 0 }}
                transition={{ duration: 0.2 }}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
              />
              <motion.span
                className={cn(
                  "block w-1 h-1 rounded-full bg-foreground",
                  isOpen ? "bg-advantis" : "group-hover/settings:bg-advantis",
                )}
                animate={{ x: isHovered || isOpen ? -7 : 0 }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-0 overflow-hidden border-none bg-transparent shadow-none"
      >
        {/* 
                   We wrap the actual content in a motion div to animate the "jump out".
                   Since it's in a Portal, 'align="end"' puts it correctly.
                   We animate scale/opacity. 
                 */}
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.8,
            y: -20,
            transformOrigin: "top right",
          }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{
            type: "spring",
            stiffness: 350,
            damping: 25,
            delay: 0.3, // Sync with the bottom dot "launching" it
          }}
          className="bg-popover border border-border rounded-md p-2 shadow-md"
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider">
            Language
          </DropdownMenuLabel>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => switchLanguage(language.code)}
                className={cn(
                  "cursor-pointer flex items-center justify-center gap-2",
                  language.code === locale &&
                    "bg-accent text-accent-foreground font-medium",
                )}
              >
                <span className="text-lg">{language.flag}</span>
                <span>{language.code.toUpperCase()}</span>
              </DropdownMenuItem>
            ))}
          </div>

<<<<<<< HEAD
                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider mt-2">
                        Appearance
                    </DropdownMenuLabel>
                    <div className="flex flex-col gap-1">
                        <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
                            <Sun className="mr-2 h-4 w-4" />
                            <span>Light</span>
                            {mounted && theme === 'light' && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
                            <Moon className="mr-2 h-4 w-4" />
                            <span>Dark</span>
                            {mounted && theme === 'dark' && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
                            <Monitor className="mr-2 h-4 w-4" />
                            <span>System</span>
                            {mounted && theme === 'system' && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
                            )}
                        </DropdownMenuItem>
                    </div>
                </motion.div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
=======
          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider mt-2">
            Appearance
          </DropdownMenuLabel>
          <div className="flex flex-col gap-1">
            <DropdownMenuItem
              onClick={() => setTheme("light")}
              className="cursor-pointer"
            >
              <Sun className="mr-2 h-4 w-4" />
              <span>Light</span>
              {mounted && theme === "light" && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("dark")}
              className="cursor-pointer"
            >
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark</span>
              {mounted && theme === "dark" && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("system")}
              className="cursor-pointer"
            >
              <Monitor className="mr-2 h-4 w-4" />
              <span>System</span>
              {mounted && theme === "system" && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-advantis" />
              )}
            </DropdownMenuItem>
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
>>>>>>> 37a6b46f1babd9e82dbe7b959d1555cc642d712e
