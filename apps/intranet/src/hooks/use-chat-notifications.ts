"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

type Permission = "default" | "granted" | "denied" | "unsupported";

function currentPermission(): Permission {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as Permission;
}

/**
 * Surfaces the "Enable notifications" affordance in the chat header.
 * Delivering the actual native notification for new messages (including
 * this conversation list's own unread bumps) happens app-wide via
 * <BrowserNotificationBridge>, gated on userPreferences.browserPushEnabled —
 * granting permission here also flips that preference on so the two stay in
 * sync and messages don't get silently dropped for users who only ever see
 * this bell button.
 */
export function useChatNotifications() {
  const [permission, setPermission] = useState<Permission>("unsupported");
  const setUserPrefs = useMutation(api.userPreferences.setMine);

  useEffect(() => {
    // Read the browser permission after paint so we don't diverge from SSR
    // (which can't know it) or trigger a synchronous cascading render.
    const id = requestAnimationFrame(() => setPermission(currentPermission()));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    if (result === "granted") {
      await setUserPrefs({ browserPushEnabled: true });
    }
  }, [setUserPrefs]);

  return { permission, requestPermission };
}
