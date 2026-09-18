"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import { AiDock, AiDockButton } from "@/components/ai/AiDock";
import { AskProvider } from "@/components/ai/ask-subject";
import { AskPanel } from "@/components/ai/AskPanel";
import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { CommandPalette } from "@/components/CommandPalette";
import { useSmoothScroll } from "@/components/effects/SmoothScrolling";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FileViewerProvider } from "@/components/file-viewer/FileViewerProvider";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { GracePeriodBanner } from "@/components/layout/GracePeriodBanner";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { SandboxBanner } from "@/components/layout/SandboxBanner";
import { BottomNavTabsProvider } from "@/components/layout/bottom-nav-tabs";
import { BottomNav } from "@/components/layout/BottomNav";
import { ClockodoHeaderControl } from "@/components/layout/ClockodoHeaderControl";
import { useFillPagePresent } from "@/components/layout/fill-page";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import {
  PageHeaderActionsSlot,
  PageHeaderBarProvider,
  PageHeaderBarSlot,
  PageHeaderTabsSlot,
} from "@/components/layout/PageHeaderBar";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { Link } from "@/components/Link";
import { MarkLogo } from "@/components/Logo";
import { BrowserNotificationBridge } from "@/components/notifications/BrowserNotificationBridge";
import { OnboardingPanel } from "@/components/onboarding/OnboardingPanel";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { OnboardingTrigger } from "@/components/onboarding/OnboardingTrigger";
import { TourCompletionScreen } from "@/components/tour/TourCompletionScreen";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { TourPopout } from "@/components/tour/TourPopout";
import { TourProgressChip } from "@/components/tour/TourProgressChip";
import { TourProvider, useTour } from "@/components/tour/TourProvider";
import { TourSpotlight } from "@/components/tour/TourSpotlight";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UpdateBanner } from "@/components/updates/UpdateBanner";
import { cn } from "@/lib/utils";

/**
 * Honors the "start page" preference: the first time this session lands on
 * the dashboard route, jump to the user's chosen page instead. Session-scoped
 * so navigating back to "/" later works normally.
 */
function StartPageRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const prefs = useQuery(api.userPreferences.getMine);

  useEffect(() => {
    if (prefs === undefined) return;
    try {
      if (sessionStorage.getItem("startpage:done")) return;
      sessionStorage.setItem("startpage:done", "1");
    } catch {
      return;
    }
    const target = prefs?.startPage;
    if (target && target !== "/" && pathname === "/") {
      router.replace(target);
    }
    // Only the first resolved prefs load matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs === undefined]);

  return null;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heartbeat = useMutation(api.presence.heartbeat);
  const mainRef = useRef<HTMLElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const { state: tourState, phase: tourPhase, targetRect } = useTour();
  const tourActive = (tourState?.active && tourPhase === "active") ?? false;

  // Chat and the announcement composer are full-screen, self-managing views
  // (their own header and sticky composer/toolbar), so they opt out of the
  // bottom nav and its clearance.
  const isAnnouncementComposer =
    pathname === "/announcements/new" ||
    pathname.startsWith("/announcements/draft/") ||
    (pathname.startsWith("/announcements/") && pathname.endsWith("/edit"));
  // Same deal for the Sales Cockpit flow composer (`/sales-cockpit/flows/<id>`,
  // but not the `/sales-cockpit/flows` list itself) — a React Flow canvas
  // needs the full viewport, not viewport-minus-bottom-nav.
  const isFlowComposer =
    pathname.startsWith("/sales-cockpit/flows/") && pathname !== "/sales-cockpit/flows/";
  // The "New wiki entry" composer, same deal — but not `/guidebooks/new/advanced`
  // (the block editor), which keeps normal page chrome.
  const isWikiComposer =
    pathname === "/guidebooks/new" ||
    pathname.startsWith("/guidebooks/draft/") ||
    (pathname.startsWith("/guidebooks/") && pathname.endsWith("/compose"));
  // Blog's composer (BlogPostComposer) is built the same full-screen way as
  // the announcement composer, but this route was never opted into
  // `immersive` — without it, <main>'s padding wrapper caps the composer's
  // `h-full` chain and it renders cut off instead of filling the viewport.
  const isBlogComposer =
    pathname === "/blog/new" ||
    pathname.startsWith("/blog/draft/") ||
    (pathname.startsWith("/blog/") && pathname.endsWith("/edit"));
  const immersive =
    pathname.startsWith("/chat") ||
    pathname.startsWith("/wiki-chat") ||
    pathname === "/hr/cv-review" ||
    isAnnouncementComposer ||
    isFlowComposer ||
    isWikiComposer ||
    isBlogComposer;

  // The Updates section reads like a blog (Anthropic/GitHub-changelog style)
  // rather than an app surface — the nav sidebar, bottom nav and the sitewide
  // "active update" banner all compete with the post itself, so they're
  // dropped in favor of a slim logo-only header. The composer at
  // /updates/new (and the draft it opens) keeps full chrome since it's an
  // editing tool, not reading.
  const isUpdatesReading =
    pathname === "/updates" ||
    (pathname.startsWith("/updates/") &&
      pathname !== "/updates/new" &&
      !pathname.startsWith("/updates/draft/"));

  // The detail page renders its own full-bleed art banner flush against
  // <main>'s edges, so <main> drops its own padding here and the page
  // supplies padding itself around everything below the banner. (A
  // negative-margin "breakout" doesn't work: overflow-y-auto forces
  // overflow-x to compute to auto too, per the CSS overflow spec, so any
  // content pushed past <main>'s padding box gets clipped right back to it.)
  const isUpdateDetail = isUpdatesReading && pathname !== "/updates";

  // A page that's one full-height workspace (see `useFillPage`) gets the whole
  // of <main>: no padding, a content wrapper that passes the height through,
  // no smooth scroll translating it, and no bottom nav over its composer.
  const fillPage = useFillPagePresent();

  // Sitewide smooth scrolling on the real scroll container (see
  // `useSmoothScroll` for why this can't be marketing's `<ReactLenis root>`).
  const lenisRef = useSmoothScroll(mainRef, mainContentRef, !immersive && !fillPage);

  // The main pane is the scroll container (not the window), so browser history
  // cannot restore its position for us. Keep one position per route for this
  // session: returning to a long feed, directory, or report should resume
  // where the person left off, while a first visit still starts at the top.
  useEffect(() => {
    const main = mainRef.current;
    if (!main || immersive) return;
    const storageKey = `intranet:scroll:${pathname}`;
    let target = 0;

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null && !window.location.hash) target = Number.parseInt(saved, 10) || 0;
    } catch {
      // Private browsing or a full storage quota should not affect navigation.
    }

    const restore = () => {
      if (lenisRef.current) lenisRef.current.scrollTo(target, { immediate: true });
      else main.scrollTo({ top: target });
    };
    // Let the new route commit before restoring, so a cached page can restore
    // its full scroll range instead of being clamped to the outgoing page.
    const frame = requestAnimationFrame(restore);
    const content = mainContentRef.current;
    let observer: ResizeObserver | undefined;
    if (target > 0 && content) {
      observer = new ResizeObserver(() => {
        if (main.scrollHeight - main.clientHeight >= target) {
          restore();
          observer?.disconnect();
        }
      });
      observer.observe(content);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      try {
        sessionStorage.setItem(storageKey, String(main.scrollTop));
      } catch {
        // See the read guard above.
      }
    };
  }, [pathname, immersive, lenisRef]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    let clearHighlight: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const focusTarget = () => {
      let id: string;
      try {
        id = decodeURIComponent(hash);
      } catch {
        return false;
      }
      const target = document.getElementById(id);
      if (!target) return false;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.setAttribute("data-hash-target-active", "");
      clearHighlight = setTimeout(() => target.removeAttribute("data-hash-target-active"), 2_500);
      return true;
    };

    const onHashChange = () => {
      if (focusTarget()) {
        observer.disconnect();
        return;
      }
      retry = setTimeout(focusTarget, 100);
    };

    const observer = new MutationObserver(() => {
      if (focusTarget()) observer.disconnect();
    });
    if (mainContentRef.current) {
      observer.observe(mainContentRef.current, { childList: true, subtree: true });
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHashChange);
      if (retry) clearTimeout(retry);
      if (clearHighlight) clearTimeout(clearHighlight);
    };
  }, [pathname]);

  // Keep presence fresh while the app is open so chat can show online state.
  // 60s leaves ample margin under the 5-minute online window
  // (UserProfile.ONLINE_WINDOW_MS) while halving the sitewide heartbeat
  // volume every signed-in user generates regardless of which page they're on.
  useEffect(() => {
    void heartbeat({});
    const id = setInterval(() => void heartbeat({}), 60_000);
    return () => clearInterval(id);
  }, [heartbeat]);

  return (
    <>
      <PostHogIdentify />
      {!isUpdatesReading && <Sidebar />}
      <SidebarInset>
        {/* Above the scrollable <main> (and the sticky header), so it's
            always on top of the page rather than scrolling away. */}
        {!immersive && !isUpdatesReading && <UpdateBanner />}
        <header
          data-tour="tour-header"
          className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border/70 bg-background/70 px-2.5 backdrop-blur-xl print:hidden md:h-16 md:px-4"
        >
          {isUpdatesReading ? (
            <Link
              href="/"
              aria-label="Advantis Intranet"
              className="-ml-1 flex items-center rounded-md p-1.5 transition-colors hover:bg-accent"
            >
              <MarkLogo size={22} className="size-[22px]" />
            </Link>
          ) : (
            <SidebarTrigger className="-ml-1" />
          )}
          {/* Page title and tabs get the whole left side — the title never
              shrinks, the tabs scroll sideways if they run out of room. */}
          <div className="flex min-w-0 flex-1 items-center">
            {!isUpdatesReading && <PageHeaderBarSlot />}
            {!isUpdatesReading && <PageHeaderTabsSlot />}
          </div>
          {/* Fixed slot right after the title — same position on every page
              regardless of which/how many actions are active, so actions
              never shift around the way they would sitting under a
              variable-length description. */}
          {!isUpdatesReading && <PageHeaderActionsSlot />}
          {/* Silent fallback: a header widget crashing shouldn't take out
              every page in the app the way an unwrapped one would. */}
          {!isUpdatesReading && (
            <ErrorBoundary fallback={() => null}>
              <ClockodoHeaderControl />
            </ErrorBoundary>
          )}
          {/* Tour progress — compact checkmark chip; self-hides when finished. */}
          {!isUpdatesReading && <TourProgressChip />}
          {!isUpdatesReading && <OnboardingTrigger />}
          <CommandPalette className="hidden md:inline-flex" />
          <AiDockButton placement="top" />
          <div data-tour="tour-notifications-btn" className="flex items-center">
            <NotificationsMenu />
          </div>
          {/* Preferences + account live in the top bar on desktop, but move to
              the sidebar footer on mobile to keep the header compact. */}
          <SettingsMenu className="hidden md:inline-flex" />
          <div className="mx-1 hidden h-6 w-px bg-border/70 md:block" />
          <AccountMenu triggerClassName="hidden md:flex" />
        </header>
        <SandboxBanner />
        <GracePeriodBanner />
        <main
          ref={mainRef}
          className={cn(
            // `overscroll-contain`: swiping past either end of the page must
            // stop here rather than handing the gesture to the document,
            // where it turns into a rubber-band or a pull-to-refresh.
            "min-h-0 flex-1 overflow-y-auto overscroll-contain print:block print:h-auto print:overflow-visible",
            !immersive && !fillPage && "md:pb-8",
            isUpdateDetail || immersive || fillPage ? "" : "px-4 pt-6 md:px-8 md:pt-8",
            immersive || fillPage ? "" : "pb-[calc(env(safe-area-inset-bottom)+5rem)]",
          )}
        >
          {/* Isolate page crashes so the surrounding shell stays usable.
              Keyed by route so navigating away clears a previous error. */}
          {immersive ? (
            <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
          ) : (
            // Lenis needs a single content element inside the scroller to
            // translate. Only rendered off the immersive branch — those routes
            // size themselves to the viewport through <main>, and an extra div
            // would break their `h-full` chain.
            <div ref={mainContentRef} className={fillPage ? "h-full" : undefined}>
              <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
            </div>
          )}
        </main>
      </SidebarInset>

      {/* Mobile bottom navigation — has nothing to open once the sidebar
          (its drawer) is unmounted, so it goes with it. */}
      {!immersive && !fillPage && !isUpdatesReading && <BottomNav />}

      {/* Native browser notifications for background tabs (opt-in). */}
      <BrowserNotificationBridge />
      <KeyboardShortcuts />
      <AiDock />
      <AskPanel />
      <StartPageRedirect />

      {/* Tour UI layers (portal-based, fixed position) */}
      <TourOverlay targetRect={targetRect} visible={tourActive} />
      <TourSpotlight targetRect={targetRect} visible={tourActive} />
      <TourPopout />
      <TourCompletionScreen />
      <OnboardingPanel />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <BottomNavTabsProvider>
        <TourProvider>
          <OnboardingProvider>
            <FileViewerProvider>
              <PageHeaderBarProvider>
                <AskProvider>
                  <AppShellInner>{children}</AppShellInner>
                </AskProvider>
              </PageHeaderBarProvider>
            </FileViewerProvider>
          </OnboardingProvider>
        </TourProvider>
      </BottomNavTabsProvider>
    </SidebarProvider>
  );
}
