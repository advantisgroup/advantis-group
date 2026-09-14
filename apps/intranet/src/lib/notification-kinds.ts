import {
  AtSign,
  Bell,
  CalendarCheck,
  GraduationCap,
  Lightbulb,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Plane,
  Share2,
  ShieldCheck,
  UploadCloud,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * How a notification type is drawn — one icon and tint per kind, so a glance
 * at the list tells you what happened before you read a word of it.
 *
 * Covers every type anything actually writes, not just the mutable ones:
 * the preferences screen only needs the subset a user can silence, but the
 * list has to render whatever turns up, including types nobody can mute.
 */
const VISUALS: Record<string, { icon: LucideIcon; tint: string }> = {
  "chat-message": {
    icon: MessageSquare,
    tint: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  },
  "chat-mention": { icon: AtSign, tint: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
  "chat-added": {
    icon: MessageSquare,
    tint: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  },
  "chat-rejoined": {
    icon: MessageSquare,
    tint: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  },
  absence_request: { icon: Plane, tint: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  absence_decision: { icon: CalendarCheck, tint: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  announcement: { icon: Megaphone, tint: "bg-primary/10 text-primary" },
  upload_request: {
    icon: UploadCloud,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  upload_decision: {
    icon: UploadCloud,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  access_request: { icon: ShieldCheck, tint: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  academy_invite: {
    icon: GraduationCap,
    tint: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
  academy_answer: {
    icon: GraduationCap,
    tint: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
  academy_finished: {
    icon: GraduationCap,
    tint: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
  draft_shared: { icon: Share2, tint: "bg-teal-500/15 text-teal-600 dark:text-teal-300" },
  draft_comment: {
    icon: MessageSquareText,
    tint: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  },
  suggestion: { icon: Lightbulb, tint: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  incident: { icon: Wrench, tint: "bg-destructive/10 text-destructive" },
  maintenance: { icon: Wrench, tint: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
};

const FALLBACK = { icon: Bell, tint: "bg-muted text-muted-foreground" };

export function notificationVisual(type: string): { icon: LucideIcon; tint: string } {
  return VISUALS[type] ?? FALLBACK;
}

/** Day buckets for the list — "3 days ago" is far less useful than knowing
 *  whether something landed while you were away. */
export type NotificationBucket = "today" | "yesterday" | "earlier";

export function bucketFor(createdAt: number, now = Date.now()): NotificationBucket {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Step back a calendar day rather than 24h: across a DST change consecutive
  // local midnights are 23 or 25 hours apart, which shifts items into the
  // wrong bucket for part of the day.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (createdAt >= today.getTime()) return "today";
  if (createdAt >= yesterday.getTime()) return "yesterday";
  return "earlier";
}
