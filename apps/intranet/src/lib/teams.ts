/**
 * Canonical team tags. A user can belong to several teams; guidebooks are
 * locked to one or more of these. Stored on `users.teams` as the `id` string.
 * Labels live in the "Teams" i18n namespace (en.json / de.json).
 */
export const TEAMS = [
  { id: "customer-care", labelKey: "customerCare" },
  { id: "inbound", labelKey: "inbound" },
  { id: "outbound", labelKey: "outbound" },
  { id: "dashboard", labelKey: "dashboard" },
] as const;

export type TeamId = (typeof TEAMS)[number]["id"];

export const TEAM_IDS: readonly string[] = TEAMS.map(t => t.id);

export function teamLabelKey(id: string): string {
  return TEAMS.find(t => t.id === id)?.labelKey ?? id;
}
