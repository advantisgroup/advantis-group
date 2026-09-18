"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { motion, useAnimationControls } from "framer-motion";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { MUTABLE_TYPES, Switch } from "@/components/notifications/NotificationPreferences";
import { cn } from "@/lib/utils";

const RING_KEYFRAMES = {
  rotate: [0, -14, 12, -8, 5, -2, 0],
  transition: { duration: 0.6, ease: "easeInOut" as const },
};

export function NotificationsStep() {
  const t = useTranslations("Onboarding");
  const tn = useTranslations("Notifications");
  const prefs = useQuery(api.notifications.notifications.getPreferences);
  const setPreferences = useMutation(api.notifications.notifications.setPreferences);
  const userPrefs = useQuery(api.userPreferences.getMine);
  const setUserPrefs = useMutation(api.userPreferences.setMine);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const bellControls = useAnimationControls();

  useEffect(() => {
    setPermission(typeof Notification !== "undefined" ? Notification.permission : null);
    void bellControls.start(RING_KEYFRAMES);
    // Ring once on mount; further rings are triggered by toggles below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const muted = prefs?.mutedTypes ?? [];
  const browserEnabled = (userPrefs?.browserPushEnabled ?? false) && permission === "granted";

  function toggleType(type: string) {
    const next = muted.includes(type) ? muted.filter((m) => m !== type) : [...muted, type];
    void setPreferences({ mutedTypes: next });
    void bellControls.start(RING_KEYFRAMES);
  }

  async function toggleBrowser() {
    if (browserEnabled) {
      await setUserPrefs({ browserPushEnabled: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error(tn("browserUnsupported"));
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(tn("browserDenied"));
      return;
    }
    await setUserPrefs({ browserPushEnabled: true });
    void bellControls.start(RING_KEYFRAMES);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <motion.span
          animate={bellControls}
          style={{ transformOrigin: "50% 0%" }}
          className="flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300"
        >
          <BellRing className="size-5" />
        </motion.span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t("notificationsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("notificationsHint")}</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="border-b border-border/60 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{tn("browserTitle")}</span>
              <span className="block text-xs text-muted-foreground">{tn("browserHint")}</span>
            </span>
            <Switch
              checked={browserEnabled}
              onToggle={() => void toggleBrowser()}
              label={tn("browserTitle")}
            />
          </div>
          {permission === "denied" && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {tn("browserDeniedHint")}
            </p>
          )}
        </div>
        {MUTABLE_TYPES.map(({ type, icon: Icon, tint }) => (
          <div
            key={type}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tint)}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{tn(`type_${type}`)}</span>
                <span className="block text-xs text-muted-foreground">{tn(`desc_${type}`)}</span>
              </span>
            </div>
            <Switch
              checked={!muted.includes(type)}
              onToggle={() => toggleType(type)}
              label={tn(`type_${type}`)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
