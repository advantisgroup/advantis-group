"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MOBILE_BREAKPOINT = 768;

import { useRouter, usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import { useCurrentUser, useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { useSidebar } from "@/components/ui/sidebar";

import { TOUR_CHECKPOINTS } from "./tour-config";
import { scrollTargetIntoView } from "./tour-scroll";
import { getOrInitTourState, writeTourState } from "./tour-storage";

import type {
  CheckpointId,
  TargetRect,
  TourCheckpoint,
  TourContextValue,
  TourLocalState,
  TourPhase,
  TourStep,
} from "./tour-types";

const TourContext = createContext<TourContextValue | null>(null);

const PADDING = 10;
const SYNC_DEBOUNCE_MS = 2000;

/** A `data-tour` value can now match more than one element at once — a
 * `PageHeaderBar` action renders both in the desktop header and, hidden via
 * CSS rather than unmounted, in the mobile bottom-nav pill. Pick whichever
 * copy is actually visible instead of always the first in DOM order. */
function findVisibleTarget(attr: string): Element | null {
  const candidates = document.querySelectorAll(`[data-tour="${attr}"]`);
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.width !== 0 || r.height !== 0) return el;
  }
  return null;
}

function measureTarget(attr: string): TargetRect | null {
  const el = findVisibleTarget(attr);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const computed = window.getComputedStyle(el);
  const borderRadius = parseFloat(computed.borderRadius) || 8;
  return {
    x: r.left - PADDING,
    y: r.top - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
    rx: Math.min(borderRadius + 4, (r.width + PADDING * 2) / 2),
  };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const upsertProgress = useMutation(api.tourProgress.upsertMyProgress);

  const [state, setState] = useState<TourLocalState | null>(null);
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [isReplayingCheckpoint, setIsReplayingCheckpoint] = useState(false);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<TourLocalState | null>(null);

  // Checkpoints visible to this user (filter manager-only checkpoints and
  // role-gated steps for employees — their target UI doesn't render for them)
  const visibleCheckpoints: TourCheckpoint[] = useMemo(
    () =>
      TOUR_CHECKPOINTS.filter((cp) => !cp.managerOnly || isManager)
        .map((cp) => ({
          ...cp,
          steps: cp.steps.filter(
            (s) =>
              !s.roles ||
              (s.roles.includes("manager") && isManager) ||
              (s.roles.includes("admin") && isAdmin),
          ),
        }))
        .filter((cp) => cp.steps.length > 0),
    [isManager, isAdmin],
  );

  // Persist state to localStorage and schedule Convex sync
  const persist = useCallback(
    (next: TourLocalState) => {
      stateRef.current = next;
      setState(next);
      writeTourState(user._id, next);

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        const s = stateRef.current;
        if (!s) return;
        const statuses: Record<string, string> = {};
        for (const cp of visibleCheckpoints) {
          statuses[cp.id] = s.checkpoints[cp.id]?.status ?? "pending";
        }
        void upsertProgress({
          checkpointStatuses: JSON.stringify(statuses),
          completedAt: s.completedAt ?? undefined,
        });
      }, SYNC_DEBOUNCE_MS);
    },
    [user._id, upsertProgress, visibleCheckpoints],
  );

  // Derive current checkpoint and step
  const currentCheckpoint = state?.currentCheckpointId
    ? (visibleCheckpoints.find((c) => c.id === state.currentCheckpointId) ?? null)
    : null;

  const currentStep: TourStep | null =
    currentCheckpoint?.steps[state?.currentStepIndex ?? 0] ?? null;

  // Initialize on mount
  useEffect(() => {
    const loaded = getOrInitTourState(user._id);

    // Filter out manager-only checkpoints for employees
    if (!isManager) {
      for (const cp of TOUR_CHECKPOINTS) {
        if (cp.managerOnly && loaded.checkpoints[cp.id]) {
          loaded.checkpoints[cp.id] = {
            status: "pending",
            currentStepIndex: 0,
          };
        }
      }
    }

    // Check snooze
    if (loaded.snoozedUntil && Date.now() < loaded.snoozedUntil) {
      loaded.active = false;
    } else if (loaded.snoozedUntil && Date.now() >= loaded.snoozedUntil) {
      loaded.snoozedUntil = null;
      loaded.active = true;
    }

    stateRef.current = loaded;
    setState(loaded);

    if (loaded.active && !loaded.completedAt) {
      setPhase("navigating");
    }
  }, [user._id, isManager]);

  // Navigate to step route when phase is navigating
  useEffect(() => {
    if (phase !== "navigating" || !currentStep) return;

    if (currentStep.action === "open-sidebar") {
      setOpenMobile(true);
    }

    if (pathname !== currentStep.route) {
      router.push(currentStep.route);
    } else {
      setPhase("measuring");
    }
  }, [phase, currentStep, pathname, router, setOpenMobile]);

  // Pathname changed — check if we've arrived at target route
  useEffect(() => {
    if (phase !== "navigating" || !currentStep) return;
    if (pathname === currentStep.route) {
      setPhase("measuring");
    }
  }, [pathname, phase, currentStep]);

  // Stable ref — will be updated to the real advance after it is defined
  const advanceRef = useRef<() => void>(() => undefined);

  // Measure target once on route
  useEffect(() => {
    if (phase !== "measuring" || !currentStep) return;

    // Skip sidebar-nav steps on mobile — those elements are hidden in the closed drawer
    if (currentStep.skipOnMobile && window.innerWidth < MOBILE_BREAKPOINT) {
      advanceRef.current();
      return;
    }

    // Target elements can mount well after navigation (route transition +
    // async data), so poll for up to a few seconds rather than a fixed,
    // tiny frame budget that gave up before slow pages were ready.
    let cancelled = false;
    let rafId = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();
    const MAX_WAIT_MS = 5000;

    function tryMeasure() {
      if (cancelled) return;
      const rect = measureTarget(currentStep!.targetAttr);
      if (rect) {
        const el = findVisibleTarget(currentStep!.targetAttr);
        void (async () => {
          if (el) await scrollTargetIntoView(el);
          if (cancelled) return;
          // Re-measure after scrolling, since the target's position may have
          // changed (or the initial rect was already off-screen).
          const settledRect = el ? measureTarget(currentStep!.targetAttr) : rect;
          setTargetRect(settledRect ?? rect);
          setPhase("active");
        })();
      } else if (Date.now() - start < MAX_WAIT_MS) {
        timer = setTimeout(() => {
          rafId = requestAnimationFrame(tryMeasure);
        }, 60);
      }
    }

    rafId = requestAnimationFrame(tryMeasure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
    };
  }, [phase, currentStep]);

  // Re-measure on resize / scroll while active
  useEffect(() => {
    if (phase !== "active" || !currentStep) return;

    function remeasure() {
      const rect = measureTarget(currentStep!.targetAttr);
      if (rect) setTargetRect(rect);
    }

    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("scroll", remeasure, {
      passive: true,
      capture: true,
    });

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", remeasure, { capture: true });
    };
  }, [phase, currentStep]);

  const findNextCheckpoint = useCallback(
    (current: CheckpointId): TourCheckpoint | null => {
      const idx = visibleCheckpoints.findIndex((c) => c.id === current);
      return visibleCheckpoints[idx + 1] ?? null;
    },
    [visibleCheckpoints],
  );

  const advance = useCallback(() => {
    if (!state || !currentCheckpoint || !currentStep) return;

    const isLastStep = state.currentStepIndex >= currentCheckpoint.steps.length - 1;

    if (!isLastStep) {
      // Next step within same checkpoint
      const nextStepIdx = state.currentStepIndex + 1;
      const next: TourLocalState = {
        ...state,
        currentStepIndex: nextStepIdx,
        checkpoints: {
          ...state.checkpoints,
          [currentCheckpoint.id]: {
            ...state.checkpoints[currentCheckpoint.id],
            currentStepIndex: nextStepIdx,
          },
        },
      };
      persist(next);
      setState(next);
      // Re-enter the navigating phase: the next step may live on a different
      // route, so let the navigation effect push it (or fall through to
      // measuring when we're already there). Going straight to "measuring"
      // would try to measure a target that isn't on the current page yet,
      // which left the tour stuck.
      setPhase("navigating");
    } else {
      // Complete this checkpoint
      const completedCheckpoints = {
        ...state.checkpoints,
        [currentCheckpoint.id]: {
          ...state.checkpoints[currentCheckpoint.id],
          status: "completed" as const,
          completedAt: Date.now(),
          currentStepIndex: 0,
        },
      };

      const nextCp = findNextCheckpoint(currentCheckpoint.id);
      const wasExplicitReplay = isReplayingCheckpoint;
      if (wasExplicitReplay) setIsReplayingCheckpoint(false);

      if (!nextCp || wasExplicitReplay) {
        // Tour complete, or an explicit single-section replay finished —
        // either way, don't auto-chain into the next checkpoint. Only mark
        // the whole tour "completedAt" when this really was the last one.
        const next: TourLocalState = {
          ...state,
          active: false,
          currentCheckpointId: null,
          currentStepIndex: 0,
          checkpoints: completedCheckpoints,
          completedAt: nextCp ? state.completedAt : Date.now(),
        };
        persist(next);
        setState(next);
        setPhase(nextCp ? "idle" : "complete");
      } else {
        const next: TourLocalState = {
          ...state,
          currentCheckpointId: nextCp.id,
          currentStepIndex: 0,
          checkpoints: {
            ...completedCheckpoints,
            [nextCp.id]: {
              ...state.checkpoints[nextCp.id],
              status: "active",
              currentStepIndex: 0,
            },
          },
        };
        persist(next);
        setState(next);
        setPhase("navigating");
      }
    }
  }, [state, currentCheckpoint, currentStep, persist, findNextCheckpoint, isReplayingCheckpoint]);
  // Update during render (not in an effect) so the measuring effect, which can
  // call advanceRef.current() to auto-skip sidebar steps on mobile, always sees
  // the current `advance` in the same commit rather than a stale closure.
  // eslint-disable-next-line react-hooks/refs
  advanceRef.current = advance;

  const back = useCallback(() => {
    if (!state || !currentCheckpoint) return;
    if (state.currentStepIndex > 0) {
      const nextIdx = state.currentStepIndex - 1;
      const next: TourLocalState = {
        ...state,
        currentStepIndex: nextIdx,
        checkpoints: {
          ...state.checkpoints,
          [currentCheckpoint.id]: {
            ...state.checkpoints[currentCheckpoint.id],
            currentStepIndex: nextIdx,
          },
        },
      };
      persist(next);
      setState(next);
      // Same as advance: the previous step may be on another route, so route
      // through "navigating" rather than measuring on the wrong page.
      setPhase("navigating");
    }
  }, [state, currentCheckpoint, persist]);

  const skipStep = useCallback(() => {
    advance();
  }, [advance]);

  const skipCheckpoint = useCallback(() => {
    if (!state || !currentCheckpoint) return;
    const nextCp = findNextCheckpoint(currentCheckpoint.id);
    const skipped: TourLocalState = {
      ...state,
      checkpoints: {
        ...state.checkpoints,
        [currentCheckpoint.id]: {
          ...state.checkpoints[currentCheckpoint.id],
          status: "skipped",
          skippedAt: Date.now(),
          currentStepIndex: 0,
        },
      },
    };
    setIsReplayingCheckpoint(false);
    if (!nextCp) {
      persist({ ...skipped, active: false, completedAt: Date.now() });
      setState({ ...skipped, active: false, completedAt: Date.now() });
      setPhase("complete");
    } else {
      const next: TourLocalState = {
        ...skipped,
        currentCheckpointId: nextCp.id,
        currentStepIndex: 0,
        checkpoints: {
          ...skipped.checkpoints,
          [nextCp.id]: {
            ...skipped.checkpoints[nextCp.id],
            status: "active",
            currentStepIndex: 0,
          },
        },
      };
      persist(next);
      setState(next);
      setPhase("navigating");
    }
  }, [state, currentCheckpoint, findNextCheckpoint, persist]);

  const endTour = useCallback(() => {
    if (!state) return;
    const next: TourLocalState = { ...state, active: false };
    setIsReplayingCheckpoint(false);
    persist(next);
    setState(next);
    setPhase("idle");
    setTargetRect(null);
  }, [state, persist]);

  const snooze = useCallback(() => {
    if (!state) return;
    const next: TourLocalState = {
      ...state,
      active: false,
      snoozedUntil: Date.now() + 86_400_000,
    };
    setIsReplayingCheckpoint(false);
    persist(next);
    setState(next);
    setPhase("idle");
    setTargetRect(null);
  }, [state, persist]);

  const redoCheckpoint = useCallback(
    (id: CheckpointId) => {
      if (!state) return;
      const cp = visibleCheckpoints.find((c) => c.id === id);
      if (!cp) return;
      const next: TourLocalState = {
        ...state,
        active: true,
        currentCheckpointId: id,
        currentStepIndex: 0,
        completedAt: null,
        checkpoints: {
          ...state.checkpoints,
          [id]: { status: "active", currentStepIndex: 0 },
        },
      };
      setIsReplayingCheckpoint(true);
      persist(next);
      setState(next);
      setPhase("navigating");
    },
    [state, visibleCheckpoints, persist],
  );

  const redoTour = useCallback(() => {
    if (!state) return;
    const checkpoints = { ...state.checkpoints };
    for (const cp of visibleCheckpoints) {
      checkpoints[cp.id] = { status: "pending", currentStepIndex: 0 };
    }
    const firstCp = visibleCheckpoints[0];
    if (!firstCp) return;
    const next: TourLocalState = {
      ...state,
      active: true,
      snoozedUntil: null,
      completedAt: null,
      currentCheckpointId: firstCp.id,
      currentStepIndex: 0,
      checkpoints: {
        ...checkpoints,
        [firstCp.id]: { status: "active", currentStepIndex: 0 },
      },
    };
    setIsReplayingCheckpoint(false);
    persist(next);
    setState(next);
    setPhase("navigating");
  }, [state, visibleCheckpoints, persist]);

  const startTour = useCallback(() => {
    if (!state) return;
    const firstCp = visibleCheckpoints[0];
    if (!firstCp) return;
    const next: TourLocalState = {
      ...state,
      active: true,
      snoozedUntil: null,
    };
    setIsReplayingCheckpoint(false);
    persist(next);
    setState(next);
    setPhase("navigating");
  }, [state, visibleCheckpoints, persist]);

  const openSidebar = useCallback(() => {
    setOpenMobile(true);
  }, [setOpenMobile]);

  const value: TourContextValue = {
    state,
    phase,
    targetRect,
    visibleCheckpoints,
    currentCheckpoint,
    currentStep,
    isReplayingCheckpoint,
    advance,
    back,
    skipStep,
    skipCheckpoint,
    endTour,
    snooze,
    redoCheckpoint,
    redoTour,
    startTour,
    openSidebar,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
