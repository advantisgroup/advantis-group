"use client";

import { useEffect } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import { pushSupported, setPushActive, subscribeBrowser, unsubscribeBrowser } from "@/lib/web-push";

/**
 * Keeps this browser's push subscription in step with the "browser
 * notifications" setting, wherever it was switched (settings, onboarding,
 * chat): subscribed while it's on and permission is granted, unsubscribed
 * when it's turned off. Renders nothing.
 */
export function PushSubscriptionSync() {
  const prefs = useQuery(api.people.preferences.getMine);
  const save = useMutation(api.notifications.push.subscribe);
  const remove = useMutation(api.notifications.push.unsubscribe);
  const wanted = prefs?.browserPushEnabled ?? false;
  const loaded = prefs !== undefined;

  useEffect(() => {
    if (!loaded || !pushSupported()) return;
    let cancelled = false;
    void (async () => {
      try {
        if (wanted && Notification.permission === "granted") {
          const subscription = await subscribeBrowser();
          if (cancelled || !subscription) return;
          await save(subscription);
          setPushActive(true);
        } else {
          setPushActive(false);
          const endpoint = await unsubscribeBrowser();
          if (endpoint) await remove({ endpoint });
        }
      } catch (error) {
        // Push is a bonus on top of the in-tab notifications; if the browser
        // refuses (private mode, blocked service workers), those still work.
        setPushActive(false);
        console.warn("[push] subscription sync failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, wanted, save, remove]);

  return null;
}
