"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import Link from "next/link";

import { Info, type LucideIcon } from "lucide-react";

import { type RouteTab, routeTabClick } from "@/components/layout/route-tab";
import { TourReplayButton, type CheckpointId } from "@/components/tour";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface PageHeaderIdentity {
  title: string;
  icon?: ReactNode;
  description?: string;
  /** Renders a replay-tour help button next to the title. */
  tourCheckpoint?: CheckpointId;
}

export interface PageHeaderAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Matches `Button`'s variant — "default" reads as the primary action. */
  variant?: "default" | "outline";
  disabled?: boolean;
  /** `data-tour` value, applied to both the desktop and mobile renderings —
   * see TourProvider's `findVisibleTarget` for why a tour step can safely
   * target an attribute that now matches two elements at once. */
  tourTarget?: string;
}

export interface PageHeaderTabs {
  tabs: RouteTab[];
  activeValue: string;
}

interface PageHeaderBarState {
  identity: PageHeaderIdentity | null;
  actions: PageHeaderAction[] | null;
  tabs: PageHeaderTabs | null;
}

const PageHeaderBarContext = createContext<PageHeaderBarState>({
  identity: null,
  actions: null,
  tabs: null,
});
type RegisterIdentity = (
  key: symbol,
  entry: { identity: PageHeaderIdentity; priority: number } | null,
) => void;

const RegisterIdentityContext = createContext<RegisterIdentity>(() => {});
const SetActionsContext = createContext<(actions: PageHeaderAction[] | null) => void>(() => {});
const SetTabsContext = createContext<(tabs: PageHeaderTabs | null) => void>(() => {});

let registrationOrder = 0;

/**
 * Two independent state slots (not one merged object) because a section's
 * layout owns `identity` for the lifetime of the section, while individual
 * tabs within it (e.g. Clockodo's admin tab) mount/unmount and contribute
 * `actions` on their own — a single shared object would have whichever
 * effect commits last clobber the other's contribution.
 *
 * Identity is a set of registrations rather than one slot, because a section
 * layout and a page inside it can both name themselves. A plain setter let
 * the layout win (a parent's effect commits after its child's) and let the
 * page, on its way out, wipe the layout's title to nothing. Now each one only
 * ever removes itself, and a page's own header outranks its section's.
 */
export function PageHeaderBarProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<
    Map<symbol, { identity: PageHeaderIdentity; priority: number; order: number }>
  >(() => new Map());
  const [actions, setActions] = useState<PageHeaderAction[] | null>(null);
  const [tabs, setTabs] = useState<PageHeaderTabs | null>(null);

  const register = useCallback<RegisterIdentity>((key, entry) => {
    setEntries((prev) => {
      const next = new Map(prev);
      if (entry) {
        next.set(key, { ...entry, order: prev.get(key)?.order ?? ++registrationOrder });
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  let identity: PageHeaderIdentity | null = null;
  let best: { priority: number; order: number } | null = null;
  for (const entry of entries.values()) {
    if (
      !best ||
      entry.priority > best.priority ||
      (entry.priority === best.priority && entry.order > best.order)
    ) {
      best = entry;
      identity = entry.identity;
    }
  }

  return (
    <RegisterIdentityContext.Provider value={register}>
      <SetActionsContext.Provider value={setActions}>
        <SetTabsContext.Provider value={setTabs}>
          <PageHeaderBarContext.Provider value={{ identity, actions, tabs }}>
            {children}
          </PageHeaderBarContext.Provider>
        </SetTabsContext.Provider>
      </SetActionsContext.Provider>
    </RegisterIdentityContext.Provider>
  );
}

export function usePageHeaderBarState() {
  return useContext(PageHeaderBarContext);
}

/** Lets `RouteTabs` move its tabs up next to the page title (refreshed design). */
export function useSetPageHeaderTabs() {
  return useContext(SetTabsContext);
}

/** The section's route tabs as small pills beside the title in the Intranet
 * Header — desktop only; phones keep them in the bottom nav. */
export function PageHeaderTabsSlot() {
  const { tabs } = usePageHeaderBarState();
  if (!tabs) return null;
  return (
    <nav className="ml-3 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] md:flex">
      {tabs.tabs.map((tab) => {
        const active = tab.value === tabs.activeValue;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            onClick={routeTabClick(tab)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Opt-in replacement for `<PageHeader>` that renders this section's
 * title/icon/description into the sticky Intranet Header instead of an
 * in-page block — see `apps/intranet/src/app/(app)/clockodo/layout.tsx` for
 * the reference usage. Only for "normal tab" pages that share the standard
 * app shell; immersive areas (ActivityTrack, Performance) keep their own
 * header. Typically called once per section (from its layout), not per tab.
 */
export function PageHeaderBar({
  title,
  icon,
  description,
  tourCheckpoint,
  priority = 0,
}: PageHeaderIdentity & {
  /** A page's own header passes 1 so it outranks the section layout's. */
  priority?: number;
}) {
  const register = useContext(RegisterIdentityContext);
  const [key] = useState(() => Symbol("page-header"));
  useEffect(() => {
    register(key, { identity: { title, icon, description, tourCheckpoint }, priority });
  }, [register, key, title, icon, description, tourCheckpoint, priority]);
  useEffect(() => () => register(key, null), [register, key]);
  return null;
}

/**
 * Registers this page's primary action button(s) as data (not JSX) — the
 * header row and the mobile bottom nav each render the same actions with
 * their own visual treatment (labelled buttons vs. icon-only pill entries),
 * the same way `RouteTab`/`BottomNavTab` share one tab list across two
 * renderings. On a phone, the top header sits well outside thumb reach, so
 * actions surface in `BottomNav`'s floating pill there instead — the header
 * slot only ever renders them at the `md` breakpoint and up.
 */
export function PageHeaderActions({ actions }: { actions: PageHeaderAction[] }) {
  const setActions = useContext(SetActionsContext);
  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [setActions, actions]);
  return null;
}

/** Renders the currently-registered title/icon/description (as a tooltip,
 * not inline text — so the header's height and the actions slot's position
 * never shift with description length) into the Intranet Header. */
export function PageHeaderBarSlot() {
  const { identity } = usePageHeaderBarState();
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  useEffect(() => setDescriptionOpen(false), [identity?.description]);

  if (!identity) return null;
  // Never truncated: on desktop it keeps its full width and the tabs beside
  // it give way instead; on a phone it wraps to a second line.
  return (
    <div className="flex min-w-0 items-center gap-1.5 md:shrink-0">
      {identity.icon && (
        <span className="flex shrink-0 items-center justify-center [&_svg]:size-4">
          {identity.icon}
        </span>
      )}
      <h1 className="min-w-0 font-display text-sm font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] md:whitespace-nowrap md:text-base refreshed:md:text-[15px]">
        {identity.title}
      </h1>
      {identity.tourCheckpoint && <TourReplayButton checkpointId={identity.tourCheckpoint} />}
      {identity.description && (
        <Tooltip open={descriptionOpen} onOpenChange={setDescriptionOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={identity.description}
              aria-expanded={descriptionOpen}
              onClick={(event) => {
                event.preventDefault();
                setDescriptionOpen((open) => !open);
              }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-fg"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs leading-relaxed" side="bottom">
            {identity.description}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Renders the currently-registered page actions into the Intranet Header,
 * in a fixed slot right after the title — same position on every page that
 * opts in, regardless of how many/which actions are active. Desktop only
 * (see `PageHeaderActions`'s doc comment) — `MobilePageHeaderActions`
 * covers the same data on a phone. */
export function PageHeaderActionsSlot() {
  const { actions } = usePageHeaderBarState();
  if (!actions || actions.length === 0) return null;
  return (
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      {actions.map((action) => (
        <Button
          key={action.key}
          variant={action.variant ?? "default"}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          data-tour={action.tourTarget}
          data-shortcut-new={action.key === "new" ? "" : undefined}
        >
          <action.icon className="size-4" />
          {action.label}
        </Button>
      ))}
    </div>
  );
}

/** Mobile counterpart of `PageHeaderActionsSlot` — same registered actions,
 * rendered as icon-only circular buttons matching `BottomNav`'s floating
 * pill so they land in the thumb zone instead of the top header. Mounted by
 * `BottomNav` itself; renders nothing when no page has registered actions. */
export function MobilePageHeaderActions() {
  const { actions } = usePageHeaderBarState();
  if (!actions || actions.length === 0) return null;
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          aria-label={action.label}
          disabled={action.disabled}
          onClick={action.onClick}
          data-tour={action.tourTarget}
          data-shortcut-new={action.key === "new" ? "" : undefined}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <action.icon className="size-4" />
        </button>
      ))}
    </>
  );
}
