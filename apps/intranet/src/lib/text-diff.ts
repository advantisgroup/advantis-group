export type DiffToken = { text: string; type: "same" | "added" | "removed" };

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/** Longest-common-subsequence match pairs between two token arrays — same
 *  technique as the wiki formatting diff, just at word granularity. */
function lcsMatches(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
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
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/** Word-level diff between two short plain-text strings — what's only in
 *  `from` is "removed", what's only in `to` is "added". Good enough for a
 *  quick "here's what restoring this would change" preview; not meant for
 *  long documents. */
export function diffWords(from: string, to: string): DiffToken[] {
  const a = tokenize(from);
  const b = tokenize(to);
  const matches = lcsMatches(a, b);
  const tokens: DiffToken[] = [];
  let ai = 0;
  let bi = 0;
  for (const [mi, mj] of matches) {
    for (; ai < mi; ai++) tokens.push({ text: a[ai], type: "removed" });
    for (; bi < mj; bi++) tokens.push({ text: b[bi], type: "added" });
    tokens.push({ text: a[mi], type: "same" });
    ai = mi + 1;
    bi = mj + 1;
  }
  for (; ai < a.length; ai++) tokens.push({ text: a[ai], type: "removed" });
  for (; bi < b.length; bi++) tokens.push({ text: b[bi], type: "added" });
  return tokens;
}
