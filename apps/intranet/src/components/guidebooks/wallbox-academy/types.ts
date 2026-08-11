/**
 * Content + progress types for the Wallbox Sales Academy interactive
 * guidebook. Content (chapters/quiz/scenarios/glossary) is German-only
 * hardcoded copy, same convention as the rest of `guidebooks/docs` — see
 * `data.ts`. Progress types describe the JSON blob persisted per user in
 * Convex (`academyProgress.data`).
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

export interface ChapterProgress {
  visited?: boolean;
  answers?: Record<number, number>;
  correct?: number;
  total?: number;
  attempts?: number;
  history?: { correct: number; total: number; date: string }[];
}

export interface CallAttempt {
  score: number;
  max: number;
  data: DataKey[];
  date: string;
  attempts?: number;
  history?: { score: number; max: number; date: string }[];
}

export interface AcademyProgressData {
  chapters: Record<string, ChapterProgress>;
  research: Record<string, string>;
  calls: Record<string, CallAttempt>;
  lastCh?: number;
  started?: string;
  finished?: string | null;
}

export const EMPTY_PROGRESS: AcademyProgressData = {
  chapters: {},
  research: {},
  calls: {},
};
