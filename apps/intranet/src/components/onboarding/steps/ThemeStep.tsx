"use client";

import { useSyncExternalStore } from "react";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const PREVIEW_COLORS = {
  light: { chrome: "#f4f4f5", bg: "#ffffff", text: "#111111", bar: "#e4e4e7" },
  dark: { chrome: "#18181b", bg: "#0a0a0a", text: "#f5f5f5", bar: "#27272a" },
} as const;

function ThemePreviewCard({
  mode,
  active,
  label,
  onSelect,
}: {
  mode: "light" | "dark";
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  const c = PREVIEW_COLORS[mode];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors",
        active
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:bg-accent"
      )}
    >
      <motion.div
        whileHover={{ scale: 1.03 }}
        className="relative h-[74px] w-full overflow-hidden rounded-lg border border-black/10"
        style={{ backgroundColor: c.bg }}
      >
        <div
          className="flex h-5 items-center gap-1 px-2"
          style={{ backgroundColor: c.chrome }}
        >
          <span className="size-1.5 rounded-full bg-red-400/70" />
          <span className="size-1.5 rounded-full bg-yellow-400/70" />
          <span className="size-1.5 rounded-full bg-green-400/70" />
        </div>
        <div className="space-y-1.5 p-2">
          <div
            className="h-2 w-3/5 rounded-full"
            style={{ backgroundColor: c.text, opacity: 0.85 }}
          />
          <div
            className="h-1.5 w-full rounded-full"
            style={{ backgroundColor: c.bar }}
          />
          <div
            className="h-1.5 w-4/5 rounded-full"
            style={{ backgroundColor: c.bar }}
          />
        </div>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 ring-2 ring-inset ring-primary"
          />
        )}
      </motion.div>
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {mode === "light" ? (
          <Sun className="size-3.5" />
        ) : (
          <Moon className="size-3.5" />
        )}
        {label}
      </span>
    </button>
  );
}

export function ThemeStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("themeTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("themeHint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ThemePreviewCard
          mode="light"
          active={mounted && theme === "light"}
          label={ts("themeLight")}
          onSelect={() => setTheme("light")}
        />
        <ThemePreviewCard
          mode="dark"
          active={mounted && theme === "dark"}
          label={ts("themeDark")}
          onSelect={() => setTheme("dark")}
        />
      </div>

      <button
        type="button"
        onClick={() => setTheme("system")}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
          mounted && theme === "system"
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:bg-accent"
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="size-4" />
          {ts("themeSystem")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("themeSystemNoPreview")}
        </span>
      </button>
    </div>
  );
}
