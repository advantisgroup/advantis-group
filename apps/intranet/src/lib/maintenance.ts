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
  // PERFORMANCE_MODE=live); Hinweis „im Aufbau“ am 27.10.2026 entfernt.
  "/performance",
  // Onboarding-Cockpit: freigegeben am 29.10.2026 (Vahan) für das Team aus
  // „Verteilung → Team“ und die Teamleitung – Zugriff regelt Convex
  // (ONBOARDING_MODE=live + Teamliste), nicht diese Liste.
  "/onboarding-cockpit",
  // Office (Grundriss/Lager, 10.11.2026): bewusst noch NICHT hier – nur Admins.
  // Freigabe für alle: Convex-Env OFFICE_MODE=live setzen und "/office" ergänzen.
  // Wissen: Wiki und KI-Assistent für alle freigegeben (19.10. / 21.10.2026, Vahan).
  "/guidebooks",
  "/wiki-chat",
  // KI-Pflege (12.11.2026): Zugriff regelt Convex (Admins + users.aiTrainer).
  "/ki-pflege",
  // Hilfe: /help, /fehlermanagement archiviert (12.11.2026), siehe ARCHIVED_PREFIXES
  "/requests",
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
  // Interaktives Tool „Terminprozess E-Mobilitäts-Check“ (12.11.2026, Vahan):
  // Projekt läuft nicht weiter.
  "/guidebooks/terminprozess-ev-check",
  "/tools/terminprozess-ev-check.html",
  // Blog-Redaktion im Intranet (19.10.2026). Die öffentliche Website zeigt
  // bereits veröffentlichte Artikel weiter an.
  "/blog",
  // IT-Tickets: ersetzt durch Wiki-Tool „Salesforce-Problem melden“ (22.10.2026).
  "/it-tickets",
  // Hilfe & Feedback (12.11.2026, Vahan): „Hilfe & Anfragen“, „Ansprechpartner“,
  // „Fehlermanagement“ (inkl. Maßnahmen) und „Verbesserungsvorschläge“.
  // „Meine Anfragen“ (/requests) bleibt offen.
  "/help",
  "/who-to-ask",
  "/fehlermanagement",
  "/suggestions",
  // Organisation (12.11.2026, Vahan): Seiten-Feedback, Dateien (OneDrive-Browser),
  // Uploads, Integrationen, Audit-Log und Zugriffsprüfung. Daten und
  // Hintergrundjobs (z. B. Integrationen, Audit-Einträge) laufen weiter.
  "/admin/design-feedback",
  "/files",
  "/admin/uploads",
  "/admin/integrations",
  "/admin/audit",
  "/admin/access-review",
  // Nachtrag 12.11.2026: Passwort-Resets (Performance und HR-Tresor haben
  // keine eigenen Passwörter mehr) und Feature-Flags (Schalter bleiben in der
  // Admin-Übersicht).
  "/admin/password-resets",
  "/admin/feature-flags",
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
