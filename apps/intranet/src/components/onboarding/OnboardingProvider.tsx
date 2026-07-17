"use client";

/* eslint-disable react-refresh/only-export-components --
   Provider colocated with its `useOnboarding` hook, imported across the app. */
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

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";

import { ONBOARDING_STEPS } from "./onboarding-config";
import {
  getOrInitOnboardingState,
  writeOnboardingState,
} from "./onboarding-storage";

import type {
  OnboardingContextValue,
  OnboardingLocalState,
  OnboardingStepId,
} from "./onboarding-types";

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const SYNC_DEBOUNCE_MS = 2000;

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const isManagerOrAdmin = useIsManager();
  const remote = useQuery(api.userPreferences.getMine);
  const setMine = useMutation(api.userPreferences.setMine);
  const resetOnboardingRemote = useMutation(
    api.userPreferences.resetOnboarding
  );

  const [local, setLocal] = useState<OnboardingLocalState | null>(null);
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);

  const stateRef = useRef<OnboardingLocalState | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const flushSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const s = stateRef.current;
    if (!s) return;
    void setMine({
      onboardingStep: s.stepIndex,
      onboardingStepStatuses: JSON.stringify(s.stepStatuses),
      ...(s.startedAt ? { onboardingStartedAt: s.startedAt } : {}),
    });
  }, [setMine]);

  // Persist local progress: always to localStorage immediately, and to Convex
  // either debounced (frequent step navigation) or right away (completion/
  // dismissal, which the header trigger elsewhere needs to see promptly).
  const persist = useCallback(
    (next: OnboardingLocalState, immediate = false) => {
      stateRef.current = next;
      setLocal(next);
      writeOnboardingState(user._id, next);

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (immediate) {
        syncTimerRef.current = null;
        void setMine({
          onboardingStep: next.stepIndex,
          onboardingStepStatuses: JSON.stringify(next.stepStatuses),
          ...(next.startedAt ? { onboardingStartedAt: next.startedAt } : {}),
          ...(next.completedAt
            ? { onboardingCompletedAt: next.completedAt }
            : {}),
          ...(next.dismissedAt
            ? { onboardingDismissedAt: next.dismissedAt }
            : {}),
        });
      } else {
        syncTimerRef.current = setTimeout(flushSync, SYNC_DEBOUNCE_MS);
      }
    },
    [user._id, setMine, flushSync]
  );

  // One-time init: wait for the cross-device query to resolve, merge it over
  // the local mirror, then decide whether to force the panel open.
  useEffect(() => {
    if (remote === undefined || initializedRef.current) return;
    initializedRef.current = true;

    const loaded = getOrInitOnboardingState(user._id);
    if (remote?.onboardingStep != null)
      loaded.stepIndex = remote.onboardingStep;
    if (remote?.onboardingStepStatuses) {
      try {
        loaded.stepStatuses = {
          ...loaded.stepStatuses,
          ...(JSON.parse(remote.onboardingStepStatuses) as Record<
            OnboardingStepId,
            "pending" | "completed" | "skipped"
          >),
        };
      } catch {
        // Malformed JSON — keep the local defaults.
      }
    }
    loaded.completedAt = remote?.onboardingCompletedAt ?? null;
    loaded.dismissedAt = remote?.onboardingDismissedAt ?? null;
    loaded.startedAt = remote?.onboardingStartedAt ?? loaded.startedAt;

    stateRef.current = loaded;
    setLocal(loaded);

    const alreadyDone =
      loaded.completedAt != null || loaded.dismissedAt != null;
    // Managers/admins never get the forced auto-open — only the header
    // trigger shows for them until they open it (or dismiss it) themselves.
    if (!alreadyDone && !loaded.seenThisSession && !isManagerOrAdmin) {
      const next: OnboardingLocalState = {
        ...loaded,
        seenThisSession: true,
        startedAt: loaded.startedAt ?? Date.now(),
      };
      persist(next);
      setOpen(true);
      setForced(true);
    } else if (!loaded.seenThisSession) {
      const next: OnboardingLocalState = { ...loaded, seenThisSession: true };
      persist(next);
    }
    // Only re-run when the query first resolves — `persist` is stable enough
    // (its own deps don't change identity across this) and re-including it
    // here would re-run init on every render once `remote` settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, user._id, isManagerOrAdmin]);

  const currentStepId: OnboardingStepId =
    ONBOARDING_STEPS[local?.stepIndex ?? 0] ?? "welcome";

  const next = useCallback(() => {
    if (!local) return;
    const idx = local.stepIndex;
    const stepId = ONBOARDING_STEPS[idx];
    const isLast = idx >= ONBOARDING_STEPS.length - 1;
    if (isLast || !stepId) return;
    const nextState: OnboardingLocalState = {
      ...local,
      stepIndex: idx + 1,
      stepStatuses: { ...local.stepStatuses, [stepId]: "completed" },
    };
    persist(nextState);
  }, [local, persist]);

  const back = useCallback(() => {
    if (!local || local.stepIndex <= 0) return;
    persist({ ...local, stepIndex: local.stepIndex - 1 });
  }, [local, persist]);

  const skip = useCallback(() => {
    if (!local) return;
    persist({ ...local, dismissedAt: Date.now() }, true);
    setOpen(false);
    setForced(false);
  }, [local, persist]);

  const close = useCallback(() => {
    flushSync();
    setOpen(false);
    setForced(false);
  }, [flushSync]);

  const complete = useCallback(() => {
    if (!local) return;
    persist(
      {
        ...local,
        stepStatuses: { ...local.stepStatuses, finish: "completed" },
        completedAt: Date.now(),
      },
      true
    );
    setOpen(false);
    setForced(false);
  }, [local, persist]);

  const reopen = useCallback(() => {
    setForced(false);
    setOpen(true);
  }, []);

  const restart = useCallback(() => {
    void resetOnboardingRemote({});
    const stepStatuses = {} as Record<
      OnboardingStepId,
      "pending" | "completed" | "skipped"
    >;
    for (const step of ONBOARDING_STEPS) stepStatuses[step] = "pending";
    const fresh: OnboardingLocalState = {
      version: 1,
      seenThisSession: true,
      stepIndex: 0,
      stepStatuses,
      startedAt: Date.now(),
      completedAt: null,
      dismissedAt: null,
    };
    stateRef.current = fresh;
    setLocal(fresh);
    writeOnboardingState(user._id, fresh);
    setForced(false);
    setOpen(true);
  }, [resetOnboardingRemote, user._id]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      open,
      forced,
      steps: ONBOARDING_STEPS,
      stepIndex: local?.stepIndex ?? 0,
      currentStepId,
      stepStatuses:
        local?.stepStatuses ??
        (Object.fromEntries(
          ONBOARDING_STEPS.map(s => [s, "pending"])
        ) as Record<OnboardingStepId, "pending" | "completed" | "skipped">),
      isCompleted: local?.completedAt != null,
      next,
      back,
      skip,
      close,
      complete,
      reopen,
      restart,
    }),
    [
      open,
      forced,
      local,
      currentStepId,
      next,
      back,
      skip,
      close,
      complete,
      reopen,
      restart,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
