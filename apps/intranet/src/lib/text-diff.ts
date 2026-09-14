export type DiffToken = { text: string; type: "same" | "added" | "removed" };

// Past this many table cells the middle of a diff is just shown as replaced
// wholesale, so a rewrite of a long text can't freeze the tab.
const MAX_LCS_CELLS = 1_500_000;

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/** Longest-common-subsequence match pairs between two arrays. Returned pairs
 *  are strictly increasing in both indices. */
export function lcsMatches(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const matches: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matches.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

function push(tokens: DiffToken[], type: DiffToken["type"], text: string) {
  const last = tokens[tokens.length - 1];
  if (last?.type === type) last.text += text;
  else tokens.push({ text, type });
}

/** Word-level diff: what's only in `from` is "removed", what's only in `to`
 *  is "added". Neighbouring tokens of the same kind come back merged. */
export function diffWords(from: string, to: string): DiffToken[] {
  const a = tokenize(from);
  const b = tokenize(to);

  // Edits are usually in one spot, so match the untouched ends first and only
  // run the expensive part on what's between them.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }
  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  const tokens: DiffToken[] = [];
  for (const token of a.slice(0, start)) push(tokens, "same", token);
  const matches = midA.length * midB.length > MAX_LCS_CELLS ? [] : lcsMatches(midA, midB);
  let ai = 0;
  let bi = 0;
  for (const [mi, mj] of matches) {
    for (; ai < mi; ai++) push(tokens, "removed", midA[ai]);
    for (; bi < mj; bi++) push(tokens, "added", midB[bi]);
    push(tokens, "same", midA[mi]);
    ai = mi + 1;
    bi = mj + 1;
  }
  for (; ai < midA.length; ai++) push(tokens, "removed", midA[ai]);
  for (; bi < midB.length; bi++) push(tokens, "added", midB[bi]);
  for (const token of a.slice(a.length - end)) push(tokens, "same", token);
  return tokens;
}

/** How many words a diff adds and removes, like a commit's +/− count. */
export function countChangedWords(tokens: DiffToken[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const token of tokens) {
    if (token.type === "same") continue;
    const words = tokenize(token.text).filter((part) => part.trim()).length;
    if (token.type === "added") added += words;
    else removed += words;
  }
  return { added, removed };
}
