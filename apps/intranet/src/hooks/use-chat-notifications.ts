"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

/** A conversation row as returned by `api.chat.listConversations`. */
interface ConversationRow {
  _id: string;
  title: string;
  lastMessagePreview: string;
  unread: number;
  muted: boolean;
  archived: boolean;
}

type Permission = "default" | "granted" | "denied" | "unsupported";

function currentPermission(): Permission {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as Permission;
}

/**
 * Fire a native browser notification when a new unread message lands in a
 * non-muted, non-archived conversation while the tab is in the background.
 * Opt-in: the caller surfaces `requestPermission` behind a button. Purely
 * client-side — no server state.
 */
export function useChatNotifications(
  conversations: ConversationRow[] | undefined
) {
  const router = useRouter();
  const [permission, setPermission] = useState<Permission>("unsupported");
  const seen = useRef<Map<string, number>>(new Map());

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
  }, []);

  useEffect(() => {
    if (!conversations) return;
    const granted =
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";

    for (const c of conversations) {
      // Baseline on first sight so we never notify for history on load.
      const before = seen.current.get(c._id) ?? c.unread;
      const isNew = c.unread > before;
      if (
        granted &&
        isNew &&
        !c.muted &&
        !c.archived &&
        typeof document !== "undefined" &&
        document.hidden
      ) {
        const notification = new Notification(c.title, {
          body: c.lastMessagePreview || "New message",
          tag: c._id,
        });
        notification.onclick = () => {
          window.focus();
          router.push(`/chat?c=${c._id}`);
          notification.close();
        };
      }
      seen.current.set(c._id, c.unread);
    }
  }, [conversations, router]);

  return { permission, requestPermission };
}
