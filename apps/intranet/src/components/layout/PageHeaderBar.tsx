"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Info } from "lucide-react";

import { TourReplayButton, type CheckpointId } from "@/components/tour";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface PageHeaderIdentity {
  title: string;
  icon?: ReactNode;
  description?: string;
  /** Renders a replay-tour help button next to the title. */
  tourCheckpoint?: CheckpointId;
}

interface PageHeaderBarState {
  identity: PageHeaderIdentity | null;
  actions: ReactNode | null;
}

const PageHeaderBarContext = createContext<PageHeaderBarState>({ identity: null, actions: null });
const SetIdentityContext = createContext<(identity: PageHeaderIdentity | null) => void>(() => {});
const SetActionsContext = createContext<(actions: ReactNode | null) => void>(() => {});

/**
 * Two independent state slots (not one merged object) because a section's
 * layout owns `identity` for the lifetime of the section, while individual
 * tabs within it (e.g. Clockodo's admin tab) mount/unmount and contribute
 * `actions` on their own — a single shared object would have whichever
 * effect commits last clobber the other's contribution.
 */
export function PageHeaderBarProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<PageHeaderIdentity | null>(null);
  const [actions, setActions] = useState<ReactNode | null>(null);
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
 * Registers this page's primary action button(s) into the Intranet Header,
 * independent of `PageHeaderBar`'s title — lets one tab within a section
 * (e.g. Clockodo's admin tab) contribute actions without owning the
 * section's title/icon, and have them disappear again when it unmounts.
 */
export function PageHeaderActions({ children }: { children: ReactNode }) {
  const setActions = useContext(SetActionsContext);
  useEffect(() => {
    setActions(children);
    return () => setActions(null);
  }, [setActions, children]);
  return null;
}

/** Renders the currently-registered title/icon/description (as a tooltip,
 * not inline text — so the header's height and the actions slot's position
 * never shift with description length) into the Intranet Header. */
export function PageHeaderBarSlot() {
  const { identity } = usePageHeaderBarState();
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={identity.description}
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
 * opts in, regardless of how many/which actions are active. */
export function PageHeaderActionsSlot() {
  const { actions } = usePageHeaderBarState();
  if (!actions) return null;
  return <div className="flex shrink-0 items-center gap-1.5 md:gap-2">{actions}</div>;
}
