"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { BookOpen, ChartNoAxesColumn, MessageCircleQuestion, Settings2, Users } from "lucide-react";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { ADMIN_BASE } from "@/components/guidebooks/wallbox-academy/TrainerView";
import { ACADEMY_ID } from "@/components/guidebooks/wallbox-academy/use-academy-progress";
import { WhoBar } from "@/components/guidebooks/wallbox-academy/WhoBar";
import { useIsAdmin } from "@/components/providers/current-user";

const HOME = "/guidebooks/wallbox-sales-academy";

const TABS = [
  { slug: "teilnehmer", label: "Teilnehmer", icon: Users },
  { slug: "auswertung", label: "Auswertung", icon: ChartNoAxesColumn },
  { slug: "inhalte", label: "Inhalte", icon: BookOpen },
  { slug: "fragen", label: "Fragen", icon: MessageCircleQuestion },
  { slug: "einstellungen", label: "Einstellungen", icon: Settings2 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, isAdminSession, academyPin, loginAdmin, logout } = useAcademySession();
  const isClerkAdmin = useIsAdmin();

  // A PIN-only session (not a real Clerk admin) can go stale: another
  // trainer changed the shared PIN, or this tab's sessionStorage predates
  // academyPin existing at all. Revalidate it before trusting isAdminSession
  // — otherwise the Trainer-area queries below fire with a wrong/empty PIN,
  // requireAcademyAdmin throws, and the route hits its error boundary
  // instead of asking for the PIN again.
  const relyingOnPin = hydrated && isAdminSession && !isClerkAdmin;
  const pinValid = useQuery(
    api.academy.settings.checkPin,
    relyingOnPin ? { academyId: ACADEMY_ID, pin: academyPin } : "skip",
  );

  useEffect(() => {
    if (!hydrated) return;
    if (isAdminSession) return;
    // Real intranet admins bypass the PIN entirely — bookmarking or
    // reloading straight into /admin still gets them in.
    if (isClerkAdmin) {
      loginAdmin();
      return;
    }
    router.replace(HOME);
  }, [hydrated, isAdminSession, isClerkAdmin, loginAdmin, router]);

  useEffect(() => {
    if (relyingOnPin && pinValid === false) {
      logout();
      router.replace(HOME);
    }
  }, [relyingOnPin, pinValid, logout, router]);

  if (!isAdminSession && !isClerkAdmin) return null;
  if (relyingOnPin && pinValid !== true) return null;

  return (
    <div>
      <WhoBar
        label="Admin"
        onLogout={() => {
          logout();
          router.push(HOME);
        }}
      />
      {/* RouteTabs rather than a hand-rolled strip, so these behave like every
          other tabbed page: pills beside the page title on desktop, and the
          bottom nav on a phone instead of a second control floating over it. */}
      <RouteTabs
        tabs={TABS.map((tab) => ({
          value: tab.slug,
          href: `${ADMIN_BASE}/${tab.slug}`,
          label: tab.label,
          icon: tab.icon,
        }))}
        activeValue={
          TABS.find((tab) => pathname.startsWith(`${ADMIN_BASE}/${tab.slug}`))?.slug ?? "teilnehmer"
        }
      />
      <div className="mt-4">{children}</div>
    </div>
  );
}
