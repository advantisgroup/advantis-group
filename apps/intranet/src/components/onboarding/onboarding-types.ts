export type OnboardingStepId =
  | "welcome"
  | "profile"
  | "department"
  | "notifications"
  | "theme"
  | "language"
  | "workspace"
  | "manager"
  | "finish";

export type OnboardingStepStatus = "pending" | "completed" | "skipped";

export interface OnboardingLocalState {
  version: 1;
  /** True once the panel has auto-opened at least once this browser session —
   * prevents re-forcing it open on every route change within the session. */
  seenThisSession: boolean;
  stepIndex: number;
  stepStatuses: Record<OnboardingStepId, OnboardingStepStatus>;
  startedAt: number | null;
  completedAt: number | null;
  dismissedAt: number | null;
}

export interface OnboardingContextValue {
  /** Whether the panel is currently rendered. */
  open: boolean;
  /** True when the panel was auto-opened (not started via the header trigger) —
   * forced sessions can't be dismissed via backdrop click/Escape, only "Skip"
   * or finishing the flow closes them. */
  forced: boolean;
  steps: OnboardingStepId[];
  stepIndex: number;
  currentStepId: OnboardingStepId;
  stepStatuses: Record<OnboardingStepId, OnboardingStepStatus>;
  isCompleted: boolean;
  isDismissed: boolean;
  next: () => void;
  back: () => void;
  /** Skip the whole flow from the welcome step — fully dismisses. */
  skip: () => void;
  /** Close the panel without finishing (voluntary sessions only) — keeps
   * progress so it resumes at the same step next time. */
  close: () => void;
  /** Finish the flow (from the finish step) — marks completed. */
  complete: () => void;
  /** Reopen the panel voluntarily (header trigger), resuming at the saved step. */
  reopen: () => void;
  /** Dismiss without opening the panel at all (header trigger's dismiss action). */
  dismiss: () => void;
  /** Reset all progress/completion and reopen at step 0 (Settings restart card). */
  restart: () => void;
}
