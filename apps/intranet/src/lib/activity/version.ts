/**
 * Numeric-segment compare (e.g. "0.3.4" vs "0.3.10") — a plain string compare
 * would rank "0.3.10" below "0.3.4". Matches the bare `x.y.z` scheme
 * `agentVersion` is validated against (see convex/activity/lib/contracts.ts).
 */
export function isOlderVersion(current: string, latest: string): boolean {
  const a = current.split(".").map(Number);
  const b = latest.split(".").map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
