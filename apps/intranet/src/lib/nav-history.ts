/**
 * The last few in-app pages the browser showed, so a record's back arrow can
 * return to wherever the user actually came from (the list, the calendar,
 * another record) instead of always the same list. In-memory on purpose: a
 * fresh tab or reload has no "previous page" inside the app.
 */
const MAX = 30;
const visited: string[] = [];

export function recordVisit(url: string) {
  if (visited[visited.length - 1] === url) return;
  visited.push(url);
  if (visited.length > MAX) visited.shift();
}

/** Most recent page, before the current one, for which `keep` is true. */
export function lastVisitWhere(keep: (url: string) => boolean): string | null {
  for (let i = visited.length - 2; i >= 0; i--) {
    if (keep(visited[i])) return visited[i];
  }
  return null;
}
