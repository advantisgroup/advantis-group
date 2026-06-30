"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter , usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { useSidebar } from "@/components/ui/sidebar";

import { TOUR_CHECKPOINTS } from "./tour-config";
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

function measureTarget(attr: string): TargetRect | null {
  const el = document.querySelector(`[data-tour="${attr}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
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
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const upsertProgress = useMutation(api.tourProgress.upsertMyProgress);

  const [state, setState] = useState<TourLocalState | null>(null);
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<TourLocalState | null>(null);

  // Checkpoints visible to this user (filter manager-only for employees)
  const visibleCheckpoints: TourCheckpoint[] = TOUR_CHECKPOINTS.filter(
    cp => !cp.managerOnly || isManager
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
    [user._id, upsertProgress, visibleCheckpoints]
  );

  // Derive current checkpoint and step
  const currentCheckpoint = state?.currentCheckpointId
    ? (visibleCheckpoints.find(c => c.id === state.currentCheckpointId) ?? null)
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

  // Measure target once on route
  useEffect(() => {
    if (phase !== "measuring" || !currentStep) return;

    let rafId: number;
    let attempts = 0;
    const maxAttempts = 20;

    function tryMeasure() {
      const rect = measureTarget(currentStep!.targetAttr);
      if (rect) {
        setTargetRect(rect);
        setPhase("active");
      } else if (attempts < maxAttempts) {
        attempts++;
        rafId = requestAnimationFrame(tryMeasure);
      }
    }

    rafId = requestAnimationFrame(tryMeasure);
    return () => cancelAnimationFrame(rafId);
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

  function findNextCheckpoint(current: CheckpointId): TourCheckpoint | null {
    const idx = visibleCheckpoints.findIndex(c => c.id === current);
    return visibleCheckpoints[idx + 1] ?? null;
  }


  const advance = useCallback(() => {
    if (!state || !currentCheckpoint || !currentStep) return;

    const isLastStep =
      state.currentStepIndex >= currentCheckpoint.steps.length - 1;

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
      setPhase("measuring");
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

      if (!nextCp) {
        // Tour complete
        const next: TourLocalState = {
          ...state,
          active: false,
          currentCheckpointId: null,
          currentStepIndex: 0,
          checkpoints: completedCheckpoints,
          completedAt: Date.now(),
        };
        persist(next);
        setState(next);
        setPhase("complete");
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
  }, [state, currentCheckpoint, currentStep, persist, findNextCheckpoint]);

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
      setPhase("measuring");
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
    persist(next);
    setState(next);
    setPhase("idle");
    setTargetRect(null);
  }, [state, persist]);

  const redoCheckpoint = useCallback(
    (id: CheckpointId) => {
      if (!state) return;
      const cp = visibleCheckpoints.find(c => c.id === id);
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
      persist(next);
      setState(next);
      setPhase("navigating");
    },
    [state, visibleCheckpoints, persist]
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
