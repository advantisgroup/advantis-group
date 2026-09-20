/**
 * Content + progress types for the Wallbox Sales Academy interactive
 * guidebook.
 *
 * Chapters, quiz questions and segment names live in Convex once an admin has
 * run the one-time content migration; `data.ts` is the seed it copies in and
 * the fallback until then (see `use-academy-content.ts`). Scenarios, research
 * tasks and the glossary are still German-only hardcoded copy in `data.ts`.
 *
 * Progress types describe the JSON blob persisted per participant in Convex
 * (`academyResults.data`).
 */

export type SegmentKey =
  | "markt"
  | "produkt"
  | "prozess"
  | "recht"
  | "vertrieb"
  | "praxis"
  | "calls";

/** Keys of data points a call-simulator scenario can require ("DLAB"). */
export type DataKey = "total" | "mix" | "us" | "comp" | "ready" | "wb" | "own" | "need" | "next";

export type ChapterBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "objections"; items: [objection: string, response: string][] }
  | { type: "diagram" };

export interface QuizQuestion {
  /** Stable id, present once the content has been migrated into Convex.
   *  Undefined for the bundled seed, where the array position is still what an
   *  answer is filed under — see `questionKey` in progress.ts. */
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface Chapter {
  id: string;
  title: string;
  segment: SegmentKey;
  body?: ChapterBlock[];
  quiz?: QuizQuestion[];
  /** This chapter is the research-tasks chapter (see RESEARCH). */
  research?: boolean;
  /** This chapter is the call-simulator chapter (see SCENARIOS). */
  sim?: boolean;
  glossary?: [term: string, definition: string][];
}

export interface ResearchTask {
  id: string;
  title: string;
  intro: string;
  links: [label: string, url: string][];
  questions: string[];
}

export interface ScenarioOption {
  text: string;
  points: 0 | 1 | 2;
  skill?: string;
  feedback: string;
  dataKeys?: DataKey[];
}

export interface ScenarioStep {
  customerSay: string;
  options: ScenarioOption[];
}

export interface Scenario {
  id: string;
  combo: string;
  title: string;
  persona: string;
  targets: DataKey[];
  outcome: string;
  steps: ScenarioStep[];
}

// --- Progress (persisted per user, JSON-encoded in Convex) -----------------

/**
 * Epoch milliseconds. These used to be `toLocaleDateString("de-DE")` strings,
 * which can't be sorted, diffed or charted — so no duration, no time-to-
 * complete, no ordering. `parseProgress` converts any old string it finds on
 * the way in, so stored blobs from before the change still read.
 */
export type ProgressTime = number;

export interface ChapterProgress {
  visited?: boolean;
  /** Keyed by `questionKey` — a question id once migrated, the array index
   *  before that. JSON object keys are strings either way. */
  answers?: Record<string, number>;
  correct?: number;
  total?: number;
  attempts?: number;
  history?: { correct: number; total: number; date: ProgressTime }[];
}

export interface CallAttempt {
  score: number;
  max: number;
  data: DataKey[];
  date: ProgressTime;
  attempts?: number;
  history?: { score: number; max: number; date: ProgressTime }[];
}

export interface AcademyProgressData {
  chapters: Record<string, ChapterProgress>;
  research: Record<string, string>;
  calls: Record<string, CallAttempt>;
  lastCh?: number;
  started?: ProgressTime;
  finished?: ProgressTime | null;
}

export const EMPTY_PROGRESS: AcademyProgressData = {
  chapters: {},
  research: {},
  calls: {},
};
