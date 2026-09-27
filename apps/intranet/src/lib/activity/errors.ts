type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * ActivityTrack's own wording for a backend error code it knows better than
 * the shared copy ("that person's Clockodo ID is managed elsewhere", "you
 * can't remove the last admin"), or `undefined` so the shared `Errors` copy
 * applies. Never the server's message text — that's diagnostics, not UI copy.
 */
export function activityErrorText(t: Translate, err: unknown): string | undefined {
  const raw = rawCode(err);
  if (!raw) return undefined;
  const key = `error.${raw}`;
  const translated = t(key);
  return translated === key ? undefined : translated;
}

function rawCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("data" in err)) return undefined;
  const data = (err as { data: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const { code } = data as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}
