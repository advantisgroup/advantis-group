import { type Role } from "@advantis/types";
import {
  BookOpen,
  Clock3,
  FolderLock,
  Inbox,
  Megaphone,
  MessageSquare,
  Newspaper,
  Plug,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User,
  Users2,
  type LucideIcon,
} from "lucide-react";

import { type Capability } from "@/components/providers/current-user";

/** One icon per base org role, so the role picker reads at a glance instead
 * of purely by label. */
export const ROLE_ICONS: Record<Role, LucideIcon> = {
  employee: User,
  manager: Users2,
  admin: ShieldCheck,
};

/** One icon per custom-role capability — reused by the role editor and by
 * the per-member access picker, so a capability looks the same wherever
 * it's shown. */
export const CAPABILITY_ICONS: Record<Capability, LucideIcon> = {
  manage_members: Users2,
  access_integrations: Plug,
  access_files: FolderLock,
  manage_uploads: UploadCloud,
  manage_announcements: Megaphone,
  manage_guidebooks: BookOpen,
  manage_blog: Newspaper,
  manage_it_ticket_threads: MessageSquare,
  view_clockodo_team: Clock3,
  manage_clockodo_team: Clock3,
  use_ai: Sparkles,
  manage_inquiries: Inbox,
};

/** Every capability, by the area of the intranet it opens — how the role
 * editor lists them. A new capability goes in exactly one group. */
export const CAPABILITY_GROUPS: {
  key: "people" | "communication" | "content" | "time" | "files" | "ai";
  capabilities: Capability[];
}[] = [
  { key: "people", capabilities: ["manage_members"] },
  {
    key: "communication",
    capabilities: ["manage_announcements", "manage_inquiries", "manage_it_ticket_threads"],
  },
  { key: "content", capabilities: ["manage_guidebooks", "manage_blog"] },
  { key: "time", capabilities: ["view_clockodo_team", "manage_clockodo_team"] },
  { key: "files", capabilities: ["access_files", "manage_uploads", "access_integrations"] },
  { key: "ai", capabilities: ["use_ai"] },
];

/** Write needs read: turning on the left one turns on (and locks) the right.
 * `org/roles.ts` does the same on save. */
export const CAPABILITY_IMPLIES: Partial<Record<Capability, Capability[]>> = {
  manage_clockodo_team: ["view_clockodo_team"],
};
