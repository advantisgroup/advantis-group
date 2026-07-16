import { ONBOARDING_STEPS } from "./onboarding-config";

import type {
  OnboardingLocalState,
  OnboardingStepStatus,
} from "./onboarding-types";

const VERSION = 1 as const;

function storageKey(userId: string) {
  return `advantis:onboarding:v1:${userId}`;
}

function buildInitialState(): OnboardingLocalState {
  const stepStatuses = {} as Record<
    (typeof ONBOARDING_STEPS)[number],
    OnboardingStepStatus
  >;
  for (const step of ONBOARDING_STEPS) {
    stepStatuses[step] = "pending";
  }
  return {
    version: VERSION,
    seenThisSession: false,
    stepIndex: 0,
    stepStatuses,
    startedAt: null,
    completedAt: null,
    dismissedAt: null,
  };
}

export function readOnboardingState(
  userId: string
): OnboardingLocalState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingLocalState;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOnboardingState(
  userId: string,
  state: OnboardingLocalState
): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private browsing etc.) — fail silently.
  }
}

export function getOrInitOnboardingState(userId: string): OnboardingLocalState {
  const existing = readOnboardingState(userId);
  if (existing) return existing;
  const initial = buildInitialState();
  writeOnboardingState(userId, initial);
  return initial;
}
