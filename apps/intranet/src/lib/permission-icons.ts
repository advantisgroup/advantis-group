import { type Role } from "@advantis/types";
import {
  Activity,
  BookOpen,
  Clock3,
  FolderLock,
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

/** One icon per custom-role capability — reused by CustomRolesPanel's own
 * editor and by the per-member access picker, so a capability looks the
 * same wherever it's shown. */
export const CAPABILITY_ICONS: Record<Capability, LucideIcon> = {
  manage_members: Users2,
  access_integrations: Plug,
  access_files: FolderLock,
  manage_uploads: UploadCloud,
  view_activity_admin: Activity,
  manage_announcements: Megaphone,
  manage_guidebooks: BookOpen,
  manage_blog: Newspaper,
  manage_it_ticket_threads: MessageSquare,
  view_clockodo_team: Clock3,
  manage_clockodo_team: Clock3,
  use_ai: Sparkles,
};
