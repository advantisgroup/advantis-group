export type CheckpointId =
  | "dashboard"
  | "announcements"
  | "calendar"
  | "absences"
  | "chat"
  | "directory"
  | "guidebooks"
  | "notifications"
  | "settings"
  | "admin"
  | "activity";

export type CheckpointStatus = "pending" | "active" | "completed" | "skipped";

export type TourPhase =
  | "idle"
  | "navigating"
  | "measuring"
  | "active"
  | "complete";

export interface CheckpointState {
  status: CheckpointStatus;
  currentStepIndex: number;
  completedAt?: number;
  skippedAt?: number;
}

export interface TourLocalState {
  version: 1;
  active: boolean;
  snoozedUntil: number | null;
  currentCheckpointId: CheckpointId | null;
  currentStepIndex: number;
  checkpoints: Record<CheckpointId, CheckpointState>;
  completedAt: number | null;
  startedAt: number | null;
}

export type PopoutSide = "top" | "bottom" | "left" | "right";

export interface TourStep {
  id: string;
  targetAttr: string;
  title: string;
  description: string;
  popoutSide: PopoutSide;
  route: string;
  /** Optional action the tour performs before spotlighting (e.g. open mobile sidebar). */
  action?: "open-sidebar";
}

export interface TourCheckpoint {
  id: CheckpointId;
  label: string;
  route: string;
  /** Only shown for manager/admin roles. */
  managerOnly?: boolean;
  steps: TourStep[];
}

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

export interface TourContextValue {
  state: TourLocalState | null;
  phase: TourPhase;
  targetRect: TargetRect | null;
  visibleCheckpoints: TourCheckpoint[];
  currentCheckpoint: TourCheckpoint | null;
  currentStep: TourStep | null;
  advance: () => void;
  back: () => void;
  skipStep: () => void;
  skipCheckpoint: () => void;
  endTour: () => void;
  snooze: () => void;
  redoCheckpoint: (id: CheckpointId) => void;
  redoTour: () => void;
  startTour: () => void;
  openSidebar: () => void;
}
