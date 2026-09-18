"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { ADMIN_BASE } from "@/components/guidebooks/wallbox-academy/TrainerView";
import { ACADEMY_ID } from "@/components/guidebooks/wallbox-academy/use-academy-progress";
import { WhoBar } from "@/components/guidebooks/wallbox-academy/WhoBar";
import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { cn } from "@/lib/utils";

const HOME = "/guidebooks/wallbox-sales-academy";

const TABS = [
  { slug: "teilnehmer", label: "Teilnehmer & Ergebnisse" },
  { slug: "fragen", label: "Fragen" },
  { slug: "einstellungen", label: "Einstellungen" },
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
      <div className="mb-4 inline-flex h-10 max-w-full items-center justify-center overflow-x-auto overscroll-x-contain rounded-lg border border-border/70 bg-muted/50 p-1 text-muted-foreground [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const href = `${ADMIN_BASE}/${tab.slug}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.slug}
              href={href}
              className={cn(
                "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground",
                active && "bg-card text-foreground shadow-sm",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
