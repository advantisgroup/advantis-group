"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  BellRing,
  CalendarCheck,
  Megaphone,
  Plane,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

/**
 * Every mutable notification type with its icon/tint. `access_request`
 * (system) is deliberately absent — admins must not mute access requests.
 */
const MUTABLE_TYPES: { type: string; icon: LucideIcon; tint: string }[] = [
  {
    type: "absence_request",
    icon: Plane,
    tint: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  },
  {
    type: "absence_decision",
    icon: CalendarCheck,
    tint: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  },
  {
    type: "announcement",
    icon: Megaphone,
    tint: "bg-primary/10 text-primary",
  },
  {
    type: "upload_request",
    icon: UploadCloud,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  {
    type: "upload_decision",
    icon: UploadCloud,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
];

export function Switch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-background shadow transition-all",
          checked ? "left-[1.375rem]" : "left-0.5"
        )}
      />
    </button>
  );
}

/**
 * Per-type notification mutes + the browser-notification opt-in. Shared
 * between the notifications tab and the settings page so preferences live in
 * both places without divergence.
 */
export function NotificationPreferences() {
  const t = useTranslations("Notifications");
  const prefs = useQuery(api.notifications.getPreferences);
  const setPreferences = useMutation(api.notifications.setPreferences);
  const userPrefs = useQuery(api.userPreferences.getMine);
  const setUserPrefs = useMutation(api.userPreferences.setMine);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null
  );

  useEffect(() => {
    // The Notification global doesn't exist during SSR; this can only be
    // read post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(
      typeof Notification !== "undefined" ? Notification.permission : null
    );
  }, []);

  const muted = prefs?.mutedTypes ?? [];

  function toggleType(type: string) {
    const next = muted.includes(type)
      ? muted.filter(m => m !== type)
      : [...muted, type];
    void setPreferences({ mutedTypes: next });
  }

  const browserEnabled =
    (userPrefs?.browserPushEnabled ?? false) && permission === "granted";

  async function toggleBrowser() {
    if (browserEnabled) {
      await setUserPrefs({ browserPushEnabled: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error(t("browserUnsupported"));
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(t("browserDenied"));
      return;
    }
    await setUserPrefs({ browserPushEnabled: true });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <BellRing className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {t("browserTitle")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("browserHint")}
            </span>
          </span>
        </div>
        <Switch
          checked={browserEnabled}
          onToggle={() => void toggleBrowser()}
          label={t("browserTitle")}
        />
      </div>
      {MUTABLE_TYPES.map(({ type, icon: Icon, tint }) => (
        <div
          key={type}
          className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg",
                tint
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="text-sm font-medium">{t(`type_${type}`)}</span>
          </div>
          <Switch
            checked={!muted.includes(type)}
            onToggle={() => toggleType(type)}
            label={t(`type_${type}`)}
          />
        </div>
      ))}
    </div>
  );
}
