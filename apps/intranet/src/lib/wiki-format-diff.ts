import { lcsMatches } from "./text-diff";

export interface FormatHunk {
  id: string;
  kind: "unchanged" | "changed";
  original: string;
  formatted: string;
}

/** Splits an HTML string into its top-level block elements (paragraphs,
 *  headings, lists, tables, ...), each as its own outerHTML string.
 *  Client-only (uses DOMParser), same technique as `sanitizeHtml`
 *  (`components/ui/rich-text.tsx`). */
function splitBlocks(html: string): string[] {
  if (typeof window === "undefined" || !html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children).map((el) => el.outerHTML);
}

function newHunkId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `h${Date.now()}${Math.random().toString(36).slice(2)}`;
}

/**
 * Aligns the original and AI-reformatted block lists into an ordered run of
 * unchanged/changed hunks, so the review UI only has to show what actually
 * changed. Concatenating every hunk's `original` must reproduce
 * `originalBlocks.join("")` byte-for-byte — that's what makes per-hunk
 * "revert" safe. Concatenating each hunk's currently-accepted text produces
 * the HTML to apply.
 *
 * Uses an LCS over the two block arrays so a block that's merely moved,
 * split, or merged still lines up correctly instead of desyncing every
 * hunk after it (a plain index-by-index comparison would).
 */
function alignBlocks(originalBlocks: string[], formattedBlocks: string[]): FormatHunk[] {
  const matches = lcsMatches(originalBlocks, formattedBlocks);
  const hunks: FormatHunk[] = [];
  let oi = 0;
  let fi = 0;
  let m = 0;

  while (m < matches.length) {
    const [matchOi, matchFi] = matches[m];
    if (matchOi > oi || matchFi > fi) {
      hunks.push({
        id: newHunkId(),
        kind: "changed",
        original: originalBlocks.slice(oi, matchOi).join(""),
        formatted: formattedBlocks.slice(fi, matchFi).join(""),
      });
    }
    // Extend through any further matches that are simply "the next block on
    // both sides" so a run of unchanged blocks becomes one hunk, not one per
    // block.
    const runStart = m;
    while (
      m < matches.length &&
      matches[m][0] === matchOi + (m - runStart) &&
      matches[m][1] === matchFi + (m - runStart)
    ) {
      m++;
    }
    const runOEnd = matchOi + (m - runStart);
    const runFEnd = matchFi + (m - runStart);
    hunks.push({
      id: newHunkId(),
      kind: "unchanged",
      original: originalBlocks.slice(matchOi, runOEnd).join(""),
      formatted: formattedBlocks.slice(matchFi, runFEnd).join(""),
    });
    oi = runOEnd;
    fi = runFEnd;
  }

  if (oi < originalBlocks.length || fi < formattedBlocks.length) {
    hunks.push({
      id: newHunkId(),
      kind: "changed",
      original: originalBlocks.slice(oi).join(""),
      formatted: formattedBlocks.slice(fi).join(""),
    });
  }

  return hunks;
}

/** Diffs a wiki entry's original body HTML against the AI-reformatted
 *  version, at block granularity (not character/line), so a "changed" hunk
 *  reads as a whole paragraph/heading/list rather than code-diff noise. */
export function diffWikiFormat(originalHtml: string, formattedHtml: string): FormatHunk[] {
  return alignBlocks(splitBlocks(originalHtml), splitBlocks(formattedHtml));
}
