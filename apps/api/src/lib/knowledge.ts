import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";

/** What `aiTraining.access.apiKnowledge` hands out: the whole current wiki and
 *  the assistant's rules. */
export type Knowledge = FunctionReturnType<typeof api.aiTraining.access.apiKnowledge>;
export type KnowledgeEntry = Knowledge["entries"][number];

/**
 * Up to this much wiki text goes to the model whole (≈ 80–90k tokens), in a
 * cached system block, so the assistant knows every entry rather than the few
 * a keyword search happened to find. Past it, the model gets a table of
 * contents of everything plus the best matches in full, and reads the rest
 * with `open`.
 */
export const FULL_WIKI_CHARS = 320_000;
const MATCHES_CHARS = 60_000;
const MATCH_COUNT = 12;

export const entryHref = (e: KnowledgeEntry) => `/guidebooks/${encodeURIComponent(e.slug)}`;
export const entryKey = (e: KnowledgeEntry) => `wiki:${e.id}`;

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function words(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3),
    ),
  ];
}

/** Entries sharing the most words with the question, best first. */
export function rankEntries(entries: KnowledgeEntry[], question: string) {
  const ws = words(question);
  if (ws.length === 0) return [];
  return entries
    .map((e) => {
      const title = e.title.toLowerCase();
      const tags = e.tags.join(" ").toLowerCase();
      const body = e.text.toLowerCase();
      let score = 0;
      for (const w of ws) {
        if (title.includes(w)) score += 3;
        if (tags.includes(w)) score += 2;
        if (body.includes(w)) score += 1;
      }
      return { e, score };
    })
    .filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
}

function entryBlock(e: KnowledgeEntry) {
  const meta = [
    `Schlüssel ${entryKey(e)}`,
    `Pfad ${entryHref(e)}`,
    e.category ? `Kategorie ${e.category}` : null,
    `Stand ${day(e.updatedAt)}`,
    e.tags.length ? `Stichwörter ${e.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<eintrag>\n# ${e.title}\n(${meta})\n${e.text}\n</eintrag>`;
}

export function rulesBlock(knowledge: Knowledge) {
  if (knowledge.rules.length === 0) return "";
  return `<regeln>\nGrundwissen und Hinweise, gepflegt von erfahrenen Kolleginnen und Kollegen in der KI-Pflege. Befolge sie, solange sie deinen übrigen Regeln nicht widersprechen. Widerspricht ein Punkt einem neueren Wiki-Eintrag, gilt der Wiki-Eintrag – nenn den Widerspruch.\n\n${knowledge.rules
    .map((r) => `## ${r.title}\n${r.text}`)
    .join("\n\n")}\n</regeln>`;
}

/**
 * The knowledge as prompt text. `stable` is the same for every question (it
 * goes into a cached system block); `matches` depends on the question and is
 * only set when the wiki is too big to send whole.
 */
export function knowledgePrompt(
  knowledge: Knowledge,
  question: string,
  /** Always table of contents + matches, however small the wiki — for
   *  callers that loop over many turns and read the rest on demand. */
  options: { contents?: boolean; matchCount?: number; matchChars?: number } = {},
) {
  const { entries } = knowledge;
  const total = entries.reduce((sum, e) => sum + e.text.length + e.title.length, 0);
  const whole = !options.contents && total <= FULL_WIKI_CHARS;
  const matchCount = options.matchCount ?? MATCH_COUNT;
  const matchChars = options.matchChars ?? MATCHES_CHARS;
  const wiki = whole
    ? `<wiki>\nDas gesamte aktuelle Wiki (${entries.length} Einträge). Du kennst damit alles, was im Wiki steht.\n\n${entries.map(entryBlock).join("\n\n")}\n</wiki>`
    : `<wiki_inhalt>\nInhaltsverzeichnis des gesamten Wikis (${entries.length} Einträge). Zu jeder Frage kommen die passendsten Einträge vollständig mit; alles andere liest du mit \`open\` und dem Schlüssel.\n\n${entries
        .map(
          (e) =>
            `- ${entryKey(e)} | ${e.title}${e.category ? ` | ${e.category}` : ""} | ${entryHref(e)} | Stand ${day(e.updatedAt)}`,
        )
        .join("\n")}\n</wiki_inhalt>`;

  const ranked = rankEntries(entries, question);
  let matches = "";
  if (!whole) {
    let used = 0;
    const picked: KnowledgeEntry[] = [];
    for (const e of ranked.slice(0, matchCount)) {
      if (used + e.text.length > matchChars && picked.length > 0) break;
      used += e.text.length;
      picked.push(e);
    }
    if (picked.length) matches = `<wiki>\n${picked.map(entryBlock).join("\n\n")}\n</wiki>`;
  }
  return {
    whole,
    stable: [rulesBlock(knowledge), wiki].filter(Boolean).join("\n\n"),
    /** The wiki part alone, for callers that show the rules their own way. */
    wiki,
    matches,
    /** Best matches, for showing what the answer most likely rests on. */
    top: ranked.slice(0, 6),
  };
}
