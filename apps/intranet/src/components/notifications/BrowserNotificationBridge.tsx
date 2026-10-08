"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { notificationHref } from "@/lib/notification-kinds";
import { usePushActive } from "@/lib/web-push";

/**
 * Fires native browser notifications for freshly arrived in-app notifications
 * while the tab is open but hidden (visible tabs already show the bell badge
 * and toasts — a system notification on top would be noise). Opt-in via
 * userPreferences.browserPushEnabled; server-side mutes already filtered the
 * rows before they exist, so no extra filtering is needed here. Stands down
 * while this browser gets Web Pushes (PushSubscriptionSync) — the service
 * worker shows those, so a notification never appears twice.
 */
export function BrowserNotificationBridge() {
  const router = useRouter();
  const prefs = useQuery(api.people.preferences.getMine);
  const pushActive = usePushActive();
  const enabled =
    !pushActive &&
    (prefs?.browserPushEnabled ?? false) &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted";
  const notifications = useQuery(
    api.notifications.notifications.list,
    enabled ? { limit: 10 } : "skip",
  );
  // Everything present on mount is old news — only notify for what arrives after.
  const watermarkRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !notifications) return;
    if (watermarkRef.current === null) {
      watermarkRef.current = Math.max(0, ...notifications.map((n) => n.createdAt));
      return;
    }
    const fresh = notifications.filter((n) => !n.readAt && n.createdAt > watermarkRef.current!);
    if (fresh.length === 0) return;
    watermarkRef.current = Math.max(...notifications.map((n) => n.createdAt));
    if (document.visibilityState === "visible") return;
    for (const n of fresh.slice(0, 3)) {
      const native = new Notification(n.title, {
        body: n.body ?? undefined,
        tag: n._id,
      });
      native.onclick = () => {
        window.focus();
        if (n.link) router.push(notificationHref(n.link, window.location.pathname));
        native.close();
      };
    }
  }, [enabled, notifications, router]);

  return null;
}
