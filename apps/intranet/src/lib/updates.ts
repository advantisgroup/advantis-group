/** Quick-pick affected-system tags for incidents/maintenance — free text is still allowed on top. */
export const KNOWN_SYSTEMS = [
  "Intranet",
  "Files/OneDrive",
  "Chat",
  "Absences/Clockodo",
  "Email",
  "Calendar",
  "Directory",
  "Guidebooks",
  "Integrations",
] as const;

export type UpdateType = "incident" | "maintenance" | "changelog";

export const INCIDENT_STATUSES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;

export const MAINTENANCE_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export function statusesForType(type: UpdateType): readonly string[] {
  if (type === "incident") return INCIDENT_STATUSES;
  if (type === "maintenance") return MAINTENANCE_STATUSES;
  return [];
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}
