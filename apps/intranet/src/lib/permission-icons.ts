import { type Role } from "@advantis/types";
import {
  Activity,
  BookOpen,
  Megaphone,
  MessageSquare,
  Plug,
  ShieldCheck,
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
  manage_uploads: UploadCloud,
  view_activity_admin: Activity,
  manage_announcements: Megaphone,
  manage_guidebooks: BookOpen,
  manage_it_ticket_threads: MessageSquare,
};
