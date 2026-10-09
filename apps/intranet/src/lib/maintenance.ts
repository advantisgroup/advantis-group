/**
 * Vorübergehende Sperre: Bereiche, die IT noch nicht geprüft hat, sind für
 * alle außer Admins gesperrt und zeigen „Wird gerade überarbeitet“
 * (`MaintenanceScreen`). Admins sehen alles, damit sie weiter prüfen können.
 *
 * Erlaubt ist nur, was unten in `OPEN_PREFIXES` steht. Einen Bereich wieder
 * freigeben = seinen Pfad hier ergänzen. Sperre ganz aufheben =
 * `MAINTENANCE_LOCK_ENABLED` auf `false` setzen.
 *
 * Nur Oberfläche, keine Sicherheitsgrenze: Daten und Hintergrundjobs laufen
 * weiter. Stand 05.10.2026 (Vahan).
 */
export const MAINTENANCE_LOCK_ENABLED = true;

const OPEN_PREFIXES = [
  // Grundausstattung
  "/notifications",
  "/directory",
  "/settings",
  // Organisation
  "/calendar",
  // Eigene Zeiterfassung – Zugriff regelt Convex (TIME_MODE), nicht diese Liste
  "/zeiterfassung",
  // "/performance" bleibt gesperrt, bis der Umbau für alle freigegeben ist
  // (Convex-Env PERFORMANCE_MODE=live, dann hier eintragen). Stand 07.10.2026.
  // Hilfe & Fehler
  "/it-tickets",
  "/help",
  "/requests",
  "/fehlermanagement",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when `pathname` is a locked area (the dashboard "/" always stays open). */
export function isMaintenanceLocked(pathname: string): boolean {
  if (!MAINTENANCE_LOCK_ENABLED) return false;
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/") return false;
  return !OPEN_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}
