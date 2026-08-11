import {
  Bot,
  Database,
  Filter,
  GraduationCap,
  Headset,
  Phone,
  PhoneCall,
  Smile,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export const SERVICE_SLUGS = [
  "customer-care",
  "contact-center",
  "telesales",
  "new-customer-acquisition",
  "customer-experience",
  "ai-automation",
  "crm",
  "sales-academy",
  "lead-management",
  "sales-outsourcing",
  "business-development",
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export const SERVICE_ICONS: Record<ServiceSlug, LucideIcon> = {
  "customer-care": Headset,
  "contact-center": PhoneCall,
  telesales: Phone,
  "new-customer-acquisition": UserPlus,
  "customer-experience": Smile,
  "ai-automation": Bot,
  crm: Database,
  "sales-academy": GraduationCap,
  "lead-management": Filter,
  "sales-outsourcing": Users,
  "business-development": TrendingUp,
};

/**
 * "Vertriebstraining" is one of the 12 tiles from the client's brief, but it
 * has no dedicated landing-page text of its own — it overlaps entirely with
 * the Sales Academy page's training portfolio, so the tile links there
 * instead of introducing a near-duplicate page.
 */
export const VERTRIEBSTRAINING_TILE = {
  icon: GraduationCap,
  slug: "sales-academy" satisfies ServiceSlug,
} as const;

export function isServiceSlug(value: string): value is ServiceSlug {
  return (SERVICE_SLUGS as readonly string[]).includes(value);
}
