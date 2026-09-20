import { cn } from "@/lib/utils";

export type BrandEmphasisTint = "start" | "end" | "dynamic";

/**
 * Function words a heading leans on but never wants emphasised — tinting
 * "for" or "the" brand-red reads as a typo, not a statement. The picker
 * skips these (and anything two letters or shorter) so the coloured word is
 * always a noun or verb worth landing on.
 */
const SKIP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "nor",
  "but",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "is",
  "are",
  "be",
  "into",
  "onto",
  "your",
  "our",
  "we",
  "you",
  "it",
  "its",
  "that",
  "this",
  "these",
  "those",
  "for",
]);

const isEmphasisCandidate = (word: string) => {
  const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
  return bare.length > 2 && !SKIP_WORDS.has(bare.toLowerCase());
};

/**
 * A stable hash of the headline itself, not `Math.random()` — so "dynamic"
 * lands on the same word every time a given string renders. Re-rolling on
 * every render would flash on re-render and could disagree between server
 * and client; hashing the content keeps the pick fixed per headline while
 * still varying across different headlines.
 */
const stableIndex = (seed: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
};

const pickWordIndex = (words: string[], tint: BrandEmphasisTint): number => {
  const candidates = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => isEmphasisCandidate(word));

  if (candidates.length === 0) return -1;
  if (tint === "start") return candidates[0].index;
  if (tint === "end") return candidates[candidates.length - 1].index;

  // "dynamic": prefer a word other than the ones `start`/`end` would already
  // pick, so the flag reads as its own choice rather than a coin flip
  // between the same two options. Short headlines without a middle fall
  // back to the full candidate list.
  const interior = candidates.slice(1, -1);
  const pool = interior.length > 0 ? interior : candidates;
  return pool[stableIndex(words.join(" "), pool.length)].index;
};

/**
 * Tints one word of a plain-text headline in the Advantis brand red — the
 * same accent the hand-split "titleHighlight" headings around the site
 * already use (see `Hero`, `HomeBrands`), but for titles that come through
 * as a single translated string rather than pre-split parts.
 *
 * `tint` picks where the emphasis lands: near the start of the line, near
 * the end, or — deterministically, per headline — somewhere in between.
 * Function words are never candidates, so whichever word is chosen can
 * always carry the emphasis without breaking the sentence's reading flow.
 */
export const BrandEmphasis = ({
  children,
  tint = "end",
  className,
}: {
  children: string;
  tint?: BrandEmphasisTint;
  className?: string;
}) => {
  const words = children.trim().split(/\s+/);
  const targetIndex = pickWordIndex(words, tint);

  if (targetIndex === -1) return children;

  return words.map((word, index) => (
    <span key={index}>
      {index === targetIndex ? (
        <span className={cn("text-advantis", className)}>{word}</span>
      ) : (
        word
      )}
      {index < words.length - 1 ? " " : ""}
    </span>
  ));
};
