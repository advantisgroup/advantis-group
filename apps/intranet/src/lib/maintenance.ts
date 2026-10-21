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
  "/announcements",
  // Eigene Zeiterfassung – Zugriff regelt Convex (TIME_MODE), nicht diese Liste
  "/zeiterfassung",
  // Performance: für alle freigegeben am 16.10.2026 (Convex-Env
  // PERFORMANCE_MODE=live); Hinweis „im Aufbau“ steht im PerformanceHeader.
  "/performance",
  // Wissen: Wiki und KI-Assistent für alle freigegeben (19.10. / 21.10.2026, Vahan).
  "/guidebooks",
  "/wiki-chat",
  // Hilfe & Fehler
  "/it-tickets",
  "/help",
  "/requests",
  "/fehlermanagement",
] as const;

/**
 * Archivierte Module (19.10.2026, Vahan): für ALLE gesperrt, auch für Admins,
 * und überall ausgeblendet (Sidebar, Suche, Dashboard, Wiki-Übersicht).
 * Code, Datenbank-Tabellen und Daten bleiben unangetastet. Zurückholen =
 * Pfad hier entfernen (Doku: Projekt-Doc „Archiv Sales-Module“).
 */
const ARCHIVED_PREFIXES = [
  "/sales-cockpit",
  "/sales-coach-ev",
  "/guidebooks/wallbox-sales-academy",
  "/wallbox-sales-academy",
  // Blog-Redaktion im Intranet (19.10.2026). Die öffentliche Website zeigt
  // bereits veröffentlichte Artikel weiter an.
  "/blog",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when `pathname` belongs to an archived module (locked for everyone). */
export function isArchived(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return ARCHIVED_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/** True when `pathname` is a locked area (the dashboard "/" always stays open). */
export function isMaintenanceLocked(pathname: string): boolean {
  if (!MAINTENANCE_LOCK_ENABLED) return false;
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/") return false;
  return !OPEN_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}
