import { TOUR_CHECKPOINTS } from "./tour-config";

import type { CheckpointId, CheckpointStatus, TourLocalState } from "./tour-types";

const VERSION = 1 as const;

function storageKey(userId: string) {
  return `advantis:tour:v1:${userId}`;
}

function buildInitialState(): TourLocalState {
  const checkpoints = {} as Record<
    CheckpointId,
    { status: CheckpointStatus; currentStepIndex: number }
  >;
  for (const cp of TOUR_CHECKPOINTS) {
    checkpoints[cp.id] = { status: "pending", currentStepIndex: 0 };
  }
  return {
    version: VERSION,
    active: true,
    snoozedUntil: null,
    currentCheckpointId: "dashboard",
    currentStepIndex: 0,
    checkpoints,
    completedAt: null,
    startedAt: Date.now(),
  };
}

export function readTourState(userId: string): TourLocalState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourLocalState;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTourState(userId: string, state: TourLocalState): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private browsing etc.) — fail silently.
  }
}

export function getOrInitTourState(userId: string): TourLocalState {
  const existing = readTourState(userId);
  if (existing) return existing;
  const initial = buildInitialState();
  writeTourState(userId, initial);
  return initial;
}

export function clearTourState(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
