export type HintType = "tip" | "warn" | "good" | "miss" | "weak";

export interface Hint {
  type: HintType;
  tag: string;
  text: string;
  time: string;
}

export type Outcome = "termin" | "wiedervorlage" | "kein_ergebnis";

export interface Scores {
  zufriedenheit: number;
  ev_schwenk: number;
  informationen: number;
  offene_fragen: number;
  sprache: number;
  quittung: number;
  abschluss: number;
  skript: number;
}

export interface Feedback {
  comments: Record<string, string>;
  missingInfos: string[];
  weakFormulations: string[];
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}

export interface CallRecord {
  id: string;
  startedAt: number;
  durationSec: number;
  callerSpeakPct: number;
  outcome: Outcome;
  transcript: string;
  scored: boolean;
  skillLevel: number | null;
  scores: Scores | null;
  feedback: Feedback | null;
}

export type WikiCategory =
  | "Produktdaten"
  | "Preisliste"
  | "Technik"
  | "Argumente"
  | "Rechtliches"
  | "Intern"
  | "Links";

export interface WikiArticle {
  _id: string;
  title: string;
  cat: WikiCategory;
  tags: string;
  body: string;
  url?: string;
  isLink?: boolean;
  authorClerkUserId: string;
  createdAt: number;
  updatedAt: number;
}

export interface RosterEntry {
  clerkUserId: string;
  userName: string;
  callCount: number;
  avgScore: number;
  appointments: number;
  trend: number;
}
