"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { ADMIN_BASE } from "@/components/guidebooks/wallbox-academy/TrainerView";
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
  const { hydrated, isAdminSession, loginAdmin, logout } = useAcademySession();
  const isClerkAdmin = useIsAdmin();

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

  if (!isAdminSession && !isClerkAdmin) return null;

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
