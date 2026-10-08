/**
 * Canonical team tags. A user can belong to several teams; guidebooks are
 * locked to one or more of these. Stored on `users.teams` as the `id` string.
 * Labels live in the "Teams" i18n namespace (en.json / de.json).
 */
export const TEAMS = [
  // Slugs stay as created ("customer-care" is now the Sales team); the label
  // is what people see.
  { id: "customer-care", labelKey: "sales" },
  { id: "ev-pilot", labelKey: "wallboxPilot" },
] as const;

export type TeamId = (typeof TEAMS)[number]["id"];

export const TEAM_IDS: readonly string[] = TEAMS.map((t) => t.id);

/** A Tailwind background class per team, used for the dots in the team picker. */
export const TEAM_COLORS: Record<string, string> = {
  "customer-care": "bg-signal",
  "ev-pilot": "bg-ok",
};

/** Team accent colour class (falls back to a neutral dot for unknown ids). */
export function teamColor(id: string): string {
  return TEAM_COLORS[id] ?? "bg-muted-foreground";
}

export function teamLabelKey(id: string): string {
  return TEAMS.find((t) => t.id === id)?.labelKey ?? id;
}

/** Display label for a team slug: the translated label for the built-in
 * teams, the slug itself for teams created later under Abteilungen & Teams
 * (they have no i18n entry). */
export function teamLabel(
  tTeams: { (key: string): string; has: (key: string) => boolean },
  id: string,
): string {
  const key = teamLabelKey(id);
  return tTeams.has(key) ? tTeams(key) : id;
}
