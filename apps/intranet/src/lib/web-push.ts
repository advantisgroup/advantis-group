"use client";

import { useSyncExternalStore } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Whether this browser can get pushes at all (and the deployment is set up
 *  for them). Without it, notifications only show while a tab is open. */
export function pushSupported(): boolean {
  return (
    !!VAPID_PUBLIC_KEY &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface SavedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/** Registers the service worker and subscribes this browser. */
export async function subscribeBrowser(): Promise<SavedSubscription | null> {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent.slice(0, 200),
  };
}

/** Unsubscribes this browser, returning the endpoint it had, if any. */
export async function unsubscribeBrowser(): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}

// Whether this tab's browser currently gets pushes — the in-tab bridge
// stands down then, so a notification never shows twice.
let active = false;
const listeners = new Set<() => void>();

export function setPushActive(next: boolean) {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

export function usePushActive(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => active,
    () => false,
  );
}
