import { type Caller } from "./caller";

/**
 * Every page in the intranet worth sending someone to — the one list the
 * "find your way around" helper and the ⌘K palette both search, instead of
 * each hardcoding its own handful of routes. `lib/pages.test.ts` fails when a
 * page exists in apps/intranet without a line here (or in NOT_DESTINATIONS),
 * so a new page can't quietly go missing from search.
 *
 * `visible` mirrors the sidebar's gating. It's a courtesy, not the guard: each
 * page still checks access itself; this only keeps search from suggesting
 * somewhere that would turn the person away.
 */
export interface IntranetPage {
  href: string;
  label: string;
  /** One sentence on what you do there — what search matches on besides the name. */
  description: string;
  /** Other words people use for it, German and English. */
  keywords?: string[];
  visible?: (caller: Caller) => boolean;
  /** Links into the page that open something straight away. */
  deepLinks?: { href: string; label: string }[];
}

const manager = (caller: Caller) => caller.isManager;
const applicants = (caller: Caller) => caller.hasApplicantAccess;
const clockodo = (caller: Caller) => !!caller.user.clockodoUserId;
const clockodoTeam = (caller: Caller) => caller.can("view_clockodo_team");

export const INTRANET_PAGES: IntranetPage[] = [
  {
    href: "/",
    label: "Startseite / Übersicht",
    description: "Dein Tag auf einen Blick: offene Aufgaben, Termine, Ankündigungen.",
    keywords: ["dashboard", "home", "start"],
  },
  {
    href: "/notifications",
    label: "Benachrichtigungen",
    description: "Alles, was dich betrifft: Erwähnungen, Zuweisungen, Freigaben.",
    keywords: ["mitteilungen", "inbox", "notifications"],
  },
  {
    href: "/calendar",
    label: "Kalender",
    description: "Firmentermine, Meetings und Abwesenheiten im Kalender.",
    keywords: ["termine", "events", "meeting", "calendar"],
    deepLinks: [{ href: "/calendar?new=1", label: "Neuen Termin anlegen" }],
  },
  {
    href: "/clockodo",
    label: "Abwesenheiten / Urlaub",
    description: "Urlaub und Abwesenheiten beantragen und den eigenen Resturlaub sehen (Clockodo).",
    keywords: ["urlaub", "krank", "abwesenheit", "vacation", "absence", "freier tag", "clockodo"],
    visible: clockodo,
  },
  {
    href: "/clockodo/requests",
    label: "Meine Abwesenheitsanträge",
    description: "Gestellte Urlaubs- und Abwesenheitsanträge und ihr Status.",
    keywords: ["urlaubsantrag", "antrag", "requests"],
    visible: clockodo,
  },
  {
    href: "/clockodo/timetable",
    label: "Arbeitszeiten",
    description: "Erfasste Arbeitszeiten und Stunden aus Clockodo.",
    keywords: ["zeiterfassung", "stunden", "timesheet", "arbeitszeit"],
    visible: clockodo,
  },
  {
    href: "/clockodo/reports",
    label: "Abwesenheitsberichte",
    description: "Auswertungen über Urlaub und Abwesenheiten.",
    keywords: ["bericht", "report", "auswertung"],
    visible: clockodoTeam,
  },
  {
    href: "/clockodo/approvals",
    label: "Abwesenheiten genehmigen",
    description: "Urlaubs- und Abwesenheitsanträge des Teams genehmigen oder ablehnen.",
    keywords: ["urlaub genehmigen", "approve", "freigeben"],
    visible: clockodoTeam,
  },
  {
    href: "/clockodo/planner",
    label: "Urlaubsplaner",
    description: "Wer im Team wann abwesend ist, als Planer.",
    keywords: ["planer", "team abwesenheiten", "planner"],
    visible: clockodoTeam,
  },
  {
    href: "/clockodo/admin",
    label: "Clockodo-Verwaltung",
    description: "Clockodo-Konten und Abwesenheitskonten verwalten.",
    visible: manager,
  },
  {
    href: "/announcements",
    label: "Ankündigungen",
    description: "Neuigkeiten und Mitteilungen aus dem Unternehmen, lesen und bestätigen.",
    keywords: ["news", "neuigkeiten", "mitteilungen", "announcements"],
    deepLinks: [{ href: "/announcements/new", label: "Neue Ankündigung schreiben" }],
  },
  {
    href: "/chat",
    label: "Chat",
    description: "Direktnachrichten und Gruppenchats mit Kolleginnen und Kollegen.",
    keywords: ["nachrichten", "messages", "dm", "schreiben"],
  },
  {
    href: "/files",
    label: "Firmendateien",
    description: "Der gemeinsame Firmen-OneDrive: dieselben Ordner für alle mit Dateizugriff.",
    keywords: ["dokumente", "ordner", "files", "onedrive"],
    visible: (caller) => caller.can("access_files"),
  },
  {
    href: "/guidebooks",
    label: "Guidebooks / Wiki",
    description: "Anleitungen, Prozesse und Wissen des Unternehmens.",
    keywords: ["anleitung", "handbuch", "wiki", "wissen", "how to"],
    deepLinks: [{ href: "/guidebooks/new", label: "Neuen Wiki-Eintrag anlegen" }],
  },
  {
    href: "/guidebooks/files",
    label: "Wiki-Dateien",
    description: "Die OneDrive-Ablage des Wikis (Team/Wiki).",
    keywords: ["anhänge", "dokumente", "files", "onedrive"],
    visible: (caller) => caller.can("manage_guidebooks"),
  },
  {
    href: "/guidebooks/wallbox-sales-academy",
    label: "Wallbox Sales Academy",
    description: "Schulung für den Wallbox-Vertrieb mit Kapiteln und Quiz.",
    keywords: ["schulung", "training", "academy", "wallbox"],
  },
  {
    href: "/wallbox-sales-academy",
    label: "Wallbox Sales Academy (Teilnehmende)",
    description: "Das Training der Academy für Teilnehmende.",
    keywords: ["schulung", "training"],
  },
  {
    href: "/wiki-chat",
    label: "Wiki-Assistent",
    description: "Dem KI-Assistenten Fragen zum Wiki stellen.",
    keywords: ["ki", "ai", "fragen", "assistant"],
  },
  {
    href: "/directory",
    label: "Personenverzeichnis",
    description: "Kolleginnen und Kollegen finden, mit Kontakt, Team und Erreichbarkeit.",
    keywords: ["kollegen", "mitarbeiter", "telefon", "people", "team", "kontakt"],
    deepLinks: [{ href: "/directory?availability=now", label: "Wer gerade erreichbar ist" }],
  },
  {
    href: "/suggestions",
    label: "Vorschläge",
    description: "Verbesserungsvorschläge einreichen, abstimmen und Entscheidungen sehen.",
    keywords: ["ideen", "verbesserung", "feedback", "idee"],
    deepLinks: [{ href: "/suggestions?new=1", label: "Neuen Vorschlag einreichen" }],
  },
  {
    href: "/it-tickets",
    label: "IT-Tickets",
    description: "IT-Probleme melden und den Stand eigener Tickets verfolgen.",
    keywords: ["support", "helpdesk", "problem", "computer", "drucker", "it"],
    deepLinks: [{ href: "/it-tickets?new=1", label: "Neues IT-Ticket melden" }],
  },
  {
    href: "/fehlermanagement",
    label: "Fehlermanagement",
    description: "Qualitätsfehler und Reklamationen erfassen und nachverfolgen (QVM).",
    keywords: ["fehler", "qualität", "reklamation", "qvm", "error"],
    deepLinks: [{ href: "/fehlermanagement?new=1", label: "Neue Fehlermeldung erfassen" }],
  },
  {
    href: "/fehlermanagement/measures",
    label: "Maßnahmen",
    description: "Maßnahmen aus dem Fehlermanagement und wer sie bis wann erledigt.",
    keywords: ["maßnahmen", "aufgaben", "todo", "measures"],
  },
  {
    href: "/fehlermanagement/dashboard",
    label: "Fehlermanagement-Auswertung",
    description: "Kennzahlen und Trends zu erfassten Fehlern.",
    keywords: ["auswertung", "kpi", "statistik"],
  },
  {
    href: "/fehlermanagement/settings",
    label: "Fehlermanagement-Einstellungen",
    description: "Kategorien und Einstellungen des Fehlermanagements.",
    visible: manager,
  },
  {
    href: "/updates",
    label: "Status & Änderungen",
    description: "Störungen, Wartungen und Neuerungen im Intranet.",
    keywords: ["störung", "changelog", "wartung", "incident", "neu"],
  },
  {
    href: "/drafts",
    label: "Meine Entwürfe",
    description: "Nicht abgeschickte Entwürfe, die automatisch gespeichert wurden.",
    keywords: ["entwurf", "drafts", "ungespeichert"],
  },
  {
    href: "/approvals",
    label: "Freigaben",
    description:
      "Abwesenheitsanträge, Zugriffsanfragen und offene Maßnahmen, die auf deine Entscheidung warten.",
    keywords: ["genehmigungen", "approvals", "freigeben", "urlaubsantrag", "zugriffsanfrage"],
    visible: manager,
  },
  {
    href: "/blog",
    label: "Blog der Website",
    description: "Blogartikel für die öffentliche Website schreiben und veröffentlichen.",
    keywords: ["artikel", "beiträge", "blog"],
    visible: (caller) => caller.can("manage_blog"),
    deepLinks: [{ href: "/blog/new", label: "Neuen Blogartikel schreiben" }],
  },
  {
    href: "/inquiries",
    label: "Kundenanfragen",
    description: "Anfragen über das Kontaktformular der Website bearbeiten.",
    keywords: ["anfragen", "kontaktformular", "leads", "kunden"],
    visible: (caller) => caller.can("manage_inquiries"),
  },
  {
    href: "/sales-coach-ev",
    label: "Sales Coach EV",
    description: "Verkaufsgespräche aufnehmen und von der KI auswerten lassen.",
    keywords: ["verkaufstraining", "gesprächsanalyse", "coach"],
  },
  {
    href: "/sales-coach-ev/progress",
    label: "Sales Coach: Fortschritt",
    description: "Ausgewertete Gespräche und die eigene Entwicklung.",
  },
  {
    href: "/sales-coach-ev/progress/summary",
    label: "Sales Coach: Tageszusammenfassung",
    description: "Die Zusammenfassung eines Verkaufstages.",
  },
  {
    href: "/sales-coach-ev/wiki",
    label: "Sales Coach Wissensdatenbank",
    description: "Wissen und Argumente für Verkaufsgespräche.",
    deepLinks: [{ href: "/sales-coach-ev/wiki/new", label: "Neuen Wissenseintrag anlegen" }],
  },
  {
    href: "/sales-coach-ev/settings",
    label: "Sales Coach: Einstellungen",
    description: "Einstellungen des Sales Coach.",
  },
  {
    href: "/sales-coach-ev/admin",
    label: "Sales Coach: Verwaltung",
    description: "Teilnehmende und Auswertungen des Sales Coach verwalten.",
    visible: manager,
  },
  {
    href: "/sales-cockpit",
    label: "Sales Cockpit",
    description: "Vertriebsprojekte, Gesprächsleitfäden und Lexikon.",
    keywords: ["vertrieb", "projekte", "sales"],
  },
  {
    href: "/sales-cockpit/projekte",
    label: "Sales Cockpit: Projekte",
    description: "Vertriebsprojekte im Überblick.",
    deepLinks: [{ href: "/sales-cockpit/projekte/new", label: "Neues Projekt anlegen" }],
  },
  {
    href: "/sales-cockpit/flows",
    label: "Sales Cockpit: Gesprächsleitfäden",
    description: "Leitfäden für Verkaufsgespräche.",
    keywords: ["leitfaden", "flow", "skript"],
  },
  {
    href: "/sales-cockpit/lexikon",
    label: "Sales Cockpit: Lexikon",
    description: "Begriffe aus dem Vertrieb erklärt.",
  },
  {
    href: "/performance",
    label: "Performance-Dashboard",
    description: "Kennzahlen zu Calls und Interaktionen.",
    keywords: ["kennzahlen", "kpi", "calls", "performance"],
  },
  {
    href: "/activity",
    label: "ActivityTrack",
    description: "Geräte- und Aktivitätsdaten der Teams.",
    keywords: ["aktivität", "geräte", "tracking"],
    visible: manager,
  },
  {
    href: "/activity/people",
    label: "ActivityTrack: Personen",
    description: "Aktivität je Person.",
    visible: manager,
  },
  {
    href: "/activity/devices",
    label: "ActivityTrack: Geräte",
    description: "Registrierte Geräte und ihr Status.",
    visible: manager,
  },
  {
    href: "/activity/reports",
    label: "ActivityTrack: Berichte",
    description: "Auswertungen aus ActivityTrack.",
    visible: manager,
  },
  {
    href: "/activity/settings",
    label: "ActivityTrack: Einstellungen",
    description: "Einstellungen für ActivityTrack.",
    visible: manager,
  },
  {
    href: "/activity/help",
    label: "ActivityTrack: Hilfe",
    description: "Wie ActivityTrack funktioniert.",
    visible: manager,
  },
  {
    href: "/activity/migration",
    label: "ActivityTrack: Migration",
    description: "Umzug von Geräten auf die neue Erfassung.",
    visible: manager,
  },
  {
    href: "/hr",
    label: "Bewerbermanagement",
    description: "Bewerbungen, Termine und Mitarbeiterakten.",
    keywords: ["bewerber", "recruiting", "applicants", "hr", "personal"],
    visible: applicants,
  },
  {
    href: "/hr/list",
    label: "Alle Bewerber",
    description: "Liste aller Bewerberinnen und Bewerber.",
    visible: applicants,
  },
  {
    href: "/hr/neu",
    label: "Neuen Bewerber anlegen",
    description: "Eine Bewerbung von Hand oder aus einem Lebenslauf anlegen.",
    visible: applicants,
  },
  {
    href: "/hr/pool",
    label: "Bewerberpool",
    description: "Bewerberinnen und Bewerber für später.",
    visible: applicants,
  },
  {
    href: "/hr/cv-review",
    label: "Lebensläufe prüfen",
    description: "Per KI ausgelesene Lebensläufe prüfen und übernehmen.",
    keywords: ["cv", "lebenslauf"],
    visible: applicants,
  },
  {
    href: "/hr/termine",
    label: "Bewerbungstermine",
    description: "Anstehende Vorstellungsgespräche und Termine.",
    visible: applicants,
  },
  {
    href: "/hr/files",
    label: "HR-Dateien",
    description: "Die OneDrive-Ordner des HR-Teams (Team/HR).",
    keywords: ["unterlagen", "dokumente"],
    visible: applicants,
  },
  {
    href: "/hr/employees",
    label: "Mitarbeiterakten",
    description: "Akten und Dokumente der Mitarbeitenden.",
    visible: applicants,
  },
  {
    href: "/hr/employees/import",
    label: "Mitarbeiterakten aus dem Intranet anlegen",
    description: "Für Intranet-Konten ohne Personalakte in einem Schritt Akten anlegen.",
    keywords: ["import", "übernehmen", "nachtragen", "backfill"],
    visible: applicants,
  },
  {
    href: "/hr/profile",
    label: "Bewerbermanagement: Profil",
    description: "Dein Profil im Bewerbermanagement.",
    visible: applicants,
  },
  {
    href: "/hr/access",
    label: "Bewerbermanagement: Zugriff",
    description: "Wer auf das Bewerbermanagement zugreifen darf.",
    visible: applicants,
  },
  {
    href: "/settings/account",
    label: "Konto & Sicherheit",
    description: "Passwort, Passkeys, Zwei-Faktor und angemeldete Geräte.",
    keywords: ["passwort", "passkey", "2fa", "sicherheit", "konto", "settings"],
  },
  {
    href: "/settings/account/profile",
    label: "Mein Profil",
    description: "Profilbild, Kontaktdaten und was andere über dich sehen.",
    keywords: ["foto", "profilbild", "profil"],
  },
  {
    href: "/settings/notifications",
    label: "Benachrichtigungseinstellungen",
    description: "Welche Benachrichtigungen du per E-Mail oder Push bekommst.",
    keywords: ["e-mails", "push", "benachrichtigungen"],
  },
  {
    href: "/settings/workspace",
    label: "Darstellung & Arbeitsbereich",
    description: "Sprache, Design und wie das Intranet für dich aussieht.",
    keywords: ["dark mode", "sprache", "theme", "language"],
  },
  {
    href: "/settings/trash",
    label: "Papierkorb",
    description: "Gelöschtes ansehen und wiederherstellen.",
    keywords: ["gelöscht", "wiederherstellen", "trash"],
  },
  {
    href: "/settings/help",
    label: "Hilfe",
    description: "Hilfe zum Intranet und wen man fragen kann.",
    keywords: ["support", "hilfe", "help"],
  },
  {
    href: "/settings/ai",
    label: "KI-Einstellungen & Datenschutz",
    description: "Was die KI im Intranet sieht, wohin es geht und wie lange es bleibt.",
    keywords: ["ki", "ai", "datenschutz", "privacy"],
  },
  {
    href: "/settings/ai/history",
    label: "KI-Verlauf",
    description: "Frühere KI-Antworten und genau das, was dafür gesendet wurde.",
    keywords: ["ki verlauf", "ai history", "transkript", "verlauf"],
  },
  {
    href: "/admin",
    label: "Adminbereich",
    description: "Überblick über die Verwaltung des Intranets.",
    visible: manager,
  },
  {
    href: "/admin/members",
    label: "Mitglieder verwalten",
    description: "Benutzerkonten, Rollen und Status der Mitglieder.",
    keywords: ["benutzer", "accounts", "users"],
    visible: manager,
  },
  {
    href: "/admin/password-resets",
    label: "Passwort-Zurücksetzungen",
    description: "Anfragen zum Zurücksetzen von Passwörtern bearbeiten.",
    visible: manager,
  },
  {
    href: "/admin/roles",
    label: "Rollen & Rechte",
    description: "Benutzerdefinierte Rollen und ihre Berechtigungen.",
    keywords: ["berechtigungen", "permissions"],
    visible: manager,
  },
  {
    href: "/admin/structure",
    label: "Abteilungen & Teams",
    description: "Abteilungen, Teams und ihre Leitungen.",
    visible: manager,
  },
  {
    href: "/admin/integrations",
    label: "Integrationen",
    description: "Anbindungen an Clockodo, Genesys, OneDrive und mehr.",
    visible: manager,
  },
  {
    href: "/admin/feature-flags",
    label: "Feature-Flags",
    description: "Funktionen des Intranets ein- und ausschalten.",
    visible: manager,
  },
  {
    href: "/admin/audit",
    label: "Audit-Log",
    description: "Wer wann was geändert hat.",
    keywords: ["protokoll", "log"],
    visible: manager,
  },
  {
    href: "/admin/access-review",
    label: "Zugriffsprüfung",
    description: "Berechtigungen regelmäßig überprüfen.",
    visible: manager,
  },
  {
    href: "/admin/invites",
    label: "Einladungen",
    description: "Neue Personen ins Intranet einladen.",
    visible: manager,
  },
  {
    href: "/admin/authentication",
    label: "Anmeldung & Authentifizierung",
    description: "Wie sich Mitglieder anmelden müssen.",
    visible: manager,
  },
  {
    href: "/admin/requests",
    label: "Zugriffsanfragen",
    description: "Anfragen auf Zugang zum Intranet.",
    visible: manager,
  },
  {
    href: "/admin/onboard",
    label: "Onboarding",
    description: "Neue Mitarbeitende anlegen und einrichten.",
    visible: manager,
  },
  {
    href: "/admin/uploads",
    label: "Uploads",
    description: "Hochgeladene Dateien prüfen und freigeben.",
    visible: manager,
  },
  {
    href: "/admin/design-feedback",
    label: "Seiten-Feedback",
    description: "Rückmeldungen zu einzelnen Seiten, mit der Seite, auf der sie geschickt wurden.",
    keywords: ["feedback", "rückmeldung", "design"],
    visible: manager,
  },
  {
    href: "/admin/ai",
    label: "KI-Aktivität",
    description: "Wie viel KI im Intranet genutzt wird, was fehlschlug und Bewertungen.",
    visible: manager,
  },
];

/**
 * Routes in apps/intranet that are deliberately not a place to send someone:
 * a step inside another page, a redirect, or a playground. Keyed by the
 * route as it appears in the app directory (route groups stripped).
 */
export const NOT_DESTINATIONS: Record<string, string> = {
  "/settings": "redirects to /settings/account",
  "/announcements/new": "listed as a deep link of /announcements",
  "/guidebooks/new": "listed as a deep link of /guidebooks",
  "/blog/new": "listed as a deep link of /blog",
  "/sales-coach-ev/wiki/new": "listed as a deep link of /sales-coach-ev/wiki",
  "/sales-cockpit/projekte/new": "listed as a deep link of /sales-cockpit/projekte",
  "/updates/new": "writing updates is an admin step inside /updates",
  "/errors": "admin-only preview of the full-page error screens (403, 404, crash)",
  "/admin/integrations/clockodo": "a tab of /admin/integrations",
  "/applicants": "served as /hr",
  "/playground": "admin-only developer playground",
  "/playground/chat": "developer playground",
  "/playground/components": "developer playground",
  "/playground/design": "developer playground",
  "/playground/drag": "developer playground",
  "/playground/motion": "developer playground",
  "/guidebooks/wallbox-sales-academy/admin": "academy admin, reached from the academy",
  "/guidebooks/wallbox-sales-academy/admin/auswertung": "academy admin tab",
  "/guidebooks/wallbox-sales-academy/admin/einstellungen": "academy admin tab",
  "/guidebooks/wallbox-sales-academy/admin/fragen": "academy admin tab",
  "/guidebooks/wallbox-sales-academy/admin/inhalte": "academy admin tab",
  "/guidebooks/wallbox-sales-academy/admin/teilnehmer": "academy admin tab",
  "/wallbox-sales-academy/training": "the academy's training step",
};

export function visiblePages(caller: Caller) {
  return INTRANET_PAGES.filter((page) => !page.visible || page.visible(caller));
}

// --- Search -------------------------------------------------------------------

function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Lowercased words of three letters or more, umlauts folded — enough to
 *  match "Urlaub" in "Wo beantrage ich Urlaub?" without a search index. */
export function searchTerms(text: string): string[] {
  return [
    ...new Set(
      fold(text)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3),
    ),
  ];
}

/** How many of `terms` appear in `haystack`. A term matches a word that
 *  starts with it, or a word it starts with, as long as the shared part is
 *  four letters or more — so "tickets" finds "ticket" and "urlaubs" finds
 *  "urlaub", but "the" finds nothing. */
export function matchScore(terms: string[], haystack: string): number {
  if (terms.length === 0) return 0;
  const words = searchTerms(haystack);
  let score = 0;
  for (const term of terms) {
    const hit = words.some((word) => {
      const [shorter, longer] = word.length < term.length ? [word, term] : [term, word];
      return shorter.length >= 4 ? longer.startsWith(shorter) : word === term;
    });
    if (hit) score += 1;
  }
  return score;
}

export function pageHaystack(page: IntranetPage) {
  return [
    page.label,
    page.description,
    ...(page.keywords ?? []),
    ...(page.deepLinks ?? []).map((link) => link.label),
    page.href,
  ].join(" ");
}
