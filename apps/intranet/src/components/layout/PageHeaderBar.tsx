"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Info, type LucideIcon } from "lucide-react";

import { TourReplayButton, type CheckpointId } from "@/components/tour";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

interface PageHeaderBarState {
  identity: PageHeaderIdentity | null;
  actions: PageHeaderAction[] | null;
}

const PageHeaderBarContext = createContext<PageHeaderBarState>({ identity: null, actions: null });
const SetIdentityContext = createContext<(identity: PageHeaderIdentity | null) => void>(() => {});
const SetActionsContext = createContext<(actions: PageHeaderAction[] | null) => void>(() => {});

/**
 * Two independent state slots (not one merged object) because a section's
 * layout owns `identity` for the lifetime of the section, while individual
 * tabs within it (e.g. Clockodo's admin tab) mount/unmount and contribute
 * `actions` on their own — a single shared object would have whichever
 * effect commits last clobber the other's contribution.
 */
export function PageHeaderBarProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<PageHeaderIdentity | null>(null);
  const [actions, setActions] = useState<PageHeaderAction[] | null>(null);
  return (
    <SetIdentityContext.Provider value={setIdentity}>
      <SetActionsContext.Provider value={setActions}>
        <PageHeaderBarContext.Provider value={{ identity, actions }}>
          {children}
        </PageHeaderBarContext.Provider>
      </SetActionsContext.Provider>
    </SetIdentityContext.Provider>
  );
}

export function usePageHeaderBarState() {
  return useContext(PageHeaderBarContext);
}

/**
 * Opt-in replacement for `<PageHeader>` that renders this section's
 * title/icon/description into the sticky Intranet Header instead of an
 * in-page block — see `apps/intranet/src/app/(app)/clockodo/layout.tsx` for
 * the reference usage. Only for "normal tab" pages that share the standard
 * app shell; immersive areas (ActivityTrack, Performance) keep their own
 * header. Typically called once per section (from its layout), not per tab.
 */
export function PageHeaderBar({ title, icon, description, tourCheckpoint }: PageHeaderIdentity) {
  const setIdentity = useContext(SetIdentityContext);
  useEffect(() => {
    setIdentity({ title, icon, description, tourCheckpoint });
    return () => setIdentity(null);
  }, [setIdentity, title, icon, description, tourCheckpoint]);
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
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {identity.icon && (
        <span className="flex shrink-0 items-center justify-center [&_svg]:size-4">
          {identity.icon}
        </span>
      )}
      <h1 className="min-w-0 truncate font-display text-sm font-semibold tracking-tight md:text-base">
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
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <action.icon className="size-4" />
        </button>
      ))}
    </>
  );
}
