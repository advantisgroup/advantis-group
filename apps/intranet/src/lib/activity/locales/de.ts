import type { Dict } from "./types";

// German (default). Keep keys in sync with en.ts.
export const de: Dict = {
  "app.name": "ActivityTrack",
  "app.tagline": "Aktivitätsübersicht für das Team",
  "nav.overview": "Übersicht",
  "nav.devices": "Geräte",
  "nav.people": "Mitarbeiter",
  "nav.reports": "Berichte",
  "nav.users": "Benutzer & Rollen",
  "nav.audit": "Protokoll",
  "nav.settings": "Einstellungen",
  "nav.signout": "Abmelden",
  "lang.label": "Sprache",
  "theme.toDark": "Dunkles Design",
  "theme.toLight": "Helles Design",
  "role.it_admin": "IT-Administrator",
  "role.manager": "Manager",
  "role.viewer": "Betrachter",

  "login.heading": "Anmelden",
  "login.signupHeading": "Konto erstellen",
  "login.email": "E-Mail",
  "login.password": "Passwort",
  "login.submit": "Anmelden",
  "login.signupSubmit": "Registrieren",
  "login.toSignup": "Noch kein Konto? Registrieren",
  "login.toSignin": "Bereits ein Konto? Anmelden",
  "login.error": "Anmeldung fehlgeschlagen. Bitte Daten prüfen.",
  "login.firstUserNote":
    "Das erste registrierte Konto wird automatisch IT-Administrator.",
  "login.passwordHint": "Mindestens 8 Zeichen.",
  "login.feature.insights":
    "Aktivitätsmuster auf einen Blick — Diagramme statt endloser Listen.",
  "login.feature.privacy":
    "Nur Aktiv-/Inaktivzeiten — keine Screenshots, keine Tastatureingaben.",

  "overview.heading": "Team-Übersicht",
  "overview.empty":
    "Noch keine genehmigten Geräte. Genehmigen Sie ein Gerät unter „Geräte“.",
  "overview.working": "Arbeitet",
  "overview.idleNow": "Inaktiv",
  "overview.offline": "Offline",
  "overview.todayActive": "heute aktiv",
  "overview.unassigned": "Nicht zugewiesen",
  "overview.lastSeen": "Zuletzt gesehen",
  "overview.total": "Geräte gesamt",
  "overview.ofTotal": "von {total} Geräten",

  "devices.heading": "Geräte",
  "devices.pending": "Wartet auf Genehmigung",
  "devices.all": "Alle Geräte",
  "devices.host": "Computer",
  "devices.user": "Benutzer",
  "devices.formerUsers": "früher:",
  "devices.status": "Status",
  "devices.person": "Mitarbeiter",
  "devices.lastSeen": "Zuletzt gesehen",
  "devices.actions": "Aktionen",
  "devices.approve": "Genehmigen",
  "devices.disable": "Deaktivieren",
  "devices.delete": "Löschen",
  "devices.link": "Zuordnen",
  "devices.none": "—",
  "status.pending": "Ausstehend",
  "status.active": "Aktiv",
  "status.disabled": "Deaktiviert",

  "people.heading": "Mitarbeiter",
  "people.add": "Mitarbeiter hinzufügen",
  "people.name": "Name",
  "people.email": "E-Mail",
  "people.active": "Aktiv",
  "people.save": "Speichern",
  "people.delete": "Löschen",
  "people.cancel": "Abbrechen",
  "people.confirmDelete": "Diesen Mitarbeiter wirklich löschen?",
  "people.empty": "Noch keine Mitarbeiter angelegt.",
  "people.employeeId": "Mitarbeiter-ID",
  "people.genesysId": "Genesys-ID",
  "people.clockodoId": "Clockodo-ID",
  "people.idsHint":
    "Verknüpft den Mitarbeiter mit Genesys und Clockodo für den zusammengeführten Live-Status.",

  "users.heading": "Benutzer & Rollen",
  "users.email": "E-Mail",
  "users.name": "Name",
  "users.role": "Rolle",

  "audit.heading": "Audit-Protokoll",
  "audit.when": "Zeitpunkt",
  "audit.actor": "Benutzer",
  "audit.action": "Aktion",
  "audit.target": "Ziel",
  "audit.empty": "Noch keine Einträge.",

  "settings.heading": "Einstellungen",
  "settings.subtitle":
    "Konfiguration, Systemstatus, Benutzer und Protokoll an einem Ort.",
  "settings.tabs.config": "Konfiguration",
  "settings.tabs.system": "Systemstatus",
  "settings.tabs.users": "Benutzer",
  "settings.tabs.audit": "Protokoll",
  "settings.config.heading": "Konfiguration",
  "settings.config.hint":
    "Legt fest, ab wann jemand als inaktiv oder ein Gerät als offline gilt und wie lange Daten aufbewahrt werden.",
  "settings.config.inactivity": "Inaktiv-Schwelle",
  "settings.config.inactivityHint":
    "Untätigkeit, ab der jemand als inaktiv zählt (für Diagramme und Kennzahlen).",
  "settings.config.offline": "Offline-Schwelle",
  "settings.config.offlineHint":
    "Zeit ohne Lebenszeichen, ab der ein Gerät als offline gilt.",
  "settings.config.retention": "Aufbewahrung",
  "settings.config.retentionHint":
    "Wie lange Rohdaten und Statusverlauf aufbewahrt werden, bevor sie gelöscht werden.",
  "settings.config.seconds": "Sekunden",
  "settings.config.days": "Tage",
  "settings.config.save": "Konfiguration speichern",
  "settings.config.saved": "Konfiguration gespeichert.",
  "settings.config.invalid": "Bitte alle Felder ausfüllen.",
  "settings.debugPw.heading": "Passwort für Tracker-Debug",
  "settings.debugPw.hint":
    "Legt das Passwort fest, mit dem die Tracker-Oberfläche auf den PCs entsperrt wird.",
  "settings.debugPw.set": "Passwort ist gesetzt.",
  "settings.debugPw.unset": "Noch kein Passwort gesetzt.",
  "settings.debugPw.new": "Neues Passwort",
  "settings.debugPw.save": "Passwort speichern",
  "settings.debugPw.saved": "Passwort gespeichert.",
  "settings.debugPw.tooShort": "Mindestens 6 Zeichen.",
  "settings.access.heading": "Zugriffskontrolle",
  "settings.access.hint":
    "Legen Sie fest, welche E-Mail-Domains sich am Dashboard anmelden dürfen.",
  "settings.access.placeholder": "example.com, firma.de",
  "settings.access.note":
    "Kommagetrennt. Jeder mit einer dieser Domains kann sich als Betrachter anmelden. Leer bedeutet: nur Administratoren.",
  "settings.access.save": "Domains speichern",
  "settings.access.saved": "Zugriffsliste gespeichert.",
  "settings.access.adminsLabel": "Administratoren",
  "settings.access.adminsHint":
    "Festgelegt über die Server-Umgebungsvariable ACTIVITYTRACK_ADMIN_EMAILS — immer voller Zugriff.",
  "settings.access.noAdmins":
    "Keine festgelegt — der erste Anmeldende wird automatisch Administrator.",

  "timeline.heading": "Verlauf",
  "timeline.back": "Zurück zur Übersicht",
  "timeline.time": "Zeit",
  "timeline.state": "Zustand",
  "timeline.idle": "Untätigkeit",
  "timeline.empty": "Keine Stichproben vorhanden.",
  "timeline.kpi.activeToday": "Heute aktiv",
  "timeline.kpi.idleToday": "Heute inaktiv",
  "timeline.kpi.activeOn": "Aktiv am {date}",
  "timeline.kpi.idleOn": "Inaktiv am {date}",
  "timeline.kpi.status": "Status",
  "timeline.kpi.lastSeen": "Zuletzt gesehen",
  "timeline.trend.heading": "Aktivität der letzten 14 Tage",
  "timeline.trend.sub": "Aktive vs. inaktive Stunden pro Tag.",
  "timeline.intraday.heading": "Tagesverlauf",
  "timeline.intraday.sub": "Anteil aktiver Stichproben im Zeitverlauf.",
  "timeline.intraday.series": "Aktiv %",
  "timeline.heatmap.heading": "Aktivität nach Tageszeit",
  "timeline.heatmap.sub": "Wann diese Person heute aktiv war.",
  "timeline.hourly.heading": "Status je Stunde (heute)",
  "timeline.hourly.sub":
    "Minuten pro Stunde nach Zustand — inaktiv, im Gespräch, Pause, Nachbearbeitung.",
  "timeline.hourly.empty":
    "Noch kein Statusverlauf für heute. Daten erscheinen, sobald Signale eintreffen.",
  "timeline.hourly.unlinked":
    "Dieses Gerät ist keinem Mitarbeiter mit Integrationen zugeordnet.",
  "timeline.state.heading": "Aktueller Status",
  "timeline.state.empty": "Noch keine Statusdaten für diesen Mitarbeiter.",
  "timeline.tabs.charts": "Übersicht",
  "timeline.tabs.raw": "Rohdaten",
  "timeline.tabs.day": "Tag im Detail",
  "timeline.tabs.export": "Export",
  "timeline.day.heading": "Minute für Minute",
  "timeline.day.sub": "Was an jedem Punkt des gewählten Tages passiert ist.",
  "timeline.day.date": "Tag",
  "timeline.day.empty": "Kein Statusverlauf für diesen Tag.",
  "timeline.day.now": "jetzt",
  "timeline.day.viewingPast": "Du siehst Daten vom {date} — nicht von heute.",
  "timeline.day.backToToday": "Zu heute",
  "timeline.day.noDataToday": "Heute noch keine Aktivität erfasst.",
  "timeline.day.rewind": "Letzten aktiven Tag ansehen ({date})",

  "reports.title": "Wochenberichte",
  "reports.subtitle":
    "Wöchentliche Aktiv-/Inaktivzeiten über alle Geräte, filter- und zeitraumbasiert.",
  "reports.timeframe": "Zeitraum",
  "reports.tf.thisWeek": "Diese Woche",
  "reports.tf.lastWeek": "Letzte Woche",
  "reports.tf.last4Weeks": "Letzte 4 Wochen",
  "reports.tf.thisMonth": "Dieser Monat",
  "reports.tf.custom": "Benutzerdefiniert",
  "reports.filter": "Filter",
  "reports.filterAll": "Alle Geräte",
  "reports.col.person": "Person / Gerät",
  "reports.col.active": "Aktiv",
  "reports.col.idle": "Inaktiv",
  "reports.col.total": "Gesamt",
  "reports.empty":
    "Keine Daten für diesen Zeitraum. Wählen Sie einen größeren Zeitraum oder ein anderes Gerät.",
  "reports.trend.heading": "Wöchentlicher Verlauf",
  "reports.trend.sub": "Aktiv- und Inaktivstunden je Woche.",
  "timeline.export.heading": "Daten exportieren",
  "timeline.export.sub":
    "Aktivitätsdaten dieses Mitarbeiters für einen Zeitraum als CSV oder JSON.",
  "timeline.export.from": "Von",
  "timeline.export.to": "Bis",
  "timeline.export.csv": "CSV herunterladen",
  "timeline.export.json": "JSON herunterladen",
  "timeline.export.done": "Export heruntergeladen.",
  "timeline.export.failed": "Export fehlgeschlagen. Bitte erneut versuchen.",
  "timeline.online": "Online",
  "timeline.offline": "Offline",

  "common.loading": "Wird geladen …",
  "common.active": "Aktiv",
  "common.idle": "Inaktiv",
  "common.forbidden": "Keine Berechtigung für diese Ansicht.",
  "common.copy": "Kopieren",
  "common.copied": "Kopiert!",
  "common.copyFailed": "Kopieren in die Zwischenablage fehlgeschlagen.",
  "common.search": "Suchen …",
  "common.noResults": "Keine Treffer.",
  "footer.privacy":
    "Datenschutz: ActivityTrack erfasst nur Aktivitätszeiten (aktiv/inaktiv) auf firmeneigenen Geräten — keine Screenshots, keine Tastatureingaben. Mitarbeiter sind informiert.",

  "devices.slots.heading": "Einschreibungs-Codes",
  "devices.slots.create": "Neuer Code",
  "devices.slots.label": "Bezeichnung (optional)",
  "devices.slots.labelPlaceholder": "z. B. „Für Johann Smith“",
  "devices.slots.expiry": "Gültig für",
  "devices.slots.expiry24": "24 Stunden",
  "devices.slots.expiry48": "48 Stunden",
  "devices.slots.expiry7d": "7 Tage",
  "devices.slots.cancel": "Abbrechen",
  "devices.slots.copy": "Kopieren",
  "devices.slots.copied": "Kopiert!",
  "devices.slots.revoke": "Widerrufen",
  "devices.slots.confirmRevoke": "Diesen Registrierungscode wirklich widerrufen?",
  "devices.slots.status.active": "Aktiv",
  "devices.slots.status.used": "Eingelöst",
  "devices.slots.status.expired": "Abgelaufen",
  "devices.slots.status.revoked": "Widerrufen",
  "devices.slots.expires": "Läuft ab",
  "devices.slots.usedAt": "Eingelöst",
  "devices.slots.empty":
    "Noch keine Codes. Erstellen Sie einen, um ein neues Gerät einzuschreiben.",
  "devices.slots.note":
    "Tragen Sie diesen Code in die config.json des Trackers ein — er wird beim ersten Start automatisch verwendet.",
  "devices.slots.heading.devices": "Alle Geräte",
  "devices.filter.search": "Suche …",
  "devices.filter.all": "Alle Status",
  "devices.empty":
    "Noch keine Geräte. Genehmigen Sie eines, sobald sich sein Tracker registriert.",
  "devices.noMatches": "Keine Geräte entsprechen diesen Filtern.",
  "devices.confirmDelete": "Dieses Gerät endgültig löschen?",
  "devices.confirmDeleteBody":
    "Dadurch wird das Gerät entfernt und sein Token widerrufen. Es muss sich komplett neu registrieren. Zum reversiblen Pausieren verwenden Sie stattdessen „Deaktivieren“.",

  "users.roleUpdated": "Rolle aktualisiert.",
  "people.updated": "Gespeichert.",
  "people.deleted": "Mitarbeiter gelöscht.",
  "devices.approved": "Gerät genehmigt.",
  "devices.disabled": "Gerät deaktiviert.",
  "devices.deleted": "Gerät gelöscht.",
  "devices.linked": "Mitarbeiter zugeordnet.",
  "devices.slotRevoked": "Code widerrufen.",

  "nav.health": "Systemstatus",

  // Live employee state (Arbeitsplatz + Genesys + Clockodo zusammengeführt).
  "nav.state": "Live-Status",
  "state.heading": "Live-Status",
  "state.subtitle":
    "Zusammengeführter Status aus Arbeitsplatz, Genesys und Clockodo.",
  "state.empty":
    "Noch keine Statusdaten. Sobald Signale eintreffen, erscheinen sie hier.",
  "state.updated": "Aktualisiert",
  "state.signals": "Signale",
  "state.source.agent": "Arbeitsplatz",
  "state.source.genesys": "Genesys",
  "state.source.clockodo": "Clockodo",
  "state.idleFor": "inaktiv seit {duration}",
  "state.health.unavailable": "{source} nicht verfügbar: {reason}",
  "state.health.unconfigured": "{source} ist nicht konfiguriert.",
  "state.health.degraded":
    "Dieses Signal wird derzeit nicht berücksichtigt. Die übrigen Quellen bestimmen den Status weiterhin.",
  "empstate.ABSENT": "Abwesend",
  "empstate.BREAK": "Pause",
  "empstate.IN_CALL": "Im Gespräch",
  "empstate.WRAP_UP": "Nachbearbeitung",
  "empstate.ACTIVE": "Aktiv",
  "empstate.IDLE": "Inaktiv",

  // Error toasts — shown when an action fails. Keyed by the backend error code.
  "error.generic": "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
  "error.network":
    "Keine Verbindung zum Server. Bitte später erneut versuchen.",
  "error.auth.required": "Bitte erneut anmelden.",
  "error.auth.forbidden": "Dafür fehlt Ihnen die Berechtigung.",
  "error.notFound.device":
    "Das Gerät wurde nicht gefunden (evtl. bereits gelöscht).",
  "error.notFound.person": "Der Mitarbeiter wurde nicht gefunden.",
  "error.notFound.user": "Der Benutzer wurde nicht gefunden.",
  "error.notFound.slot": "Der Code wurde nicht gefunden.",
  "error.notFound.event": "Der Eintrag wurde nicht gefunden.",
  "error.validation.password_short":
    "Das Passwort muss mindestens 6 Zeichen haben.",
  "error.validation.out_of_range":
    "Der Wert liegt außerhalb des zulässigen Bereichs.",
  "error.user.cannot_demote_self":
    "Sie können sich nicht selbst die IT-Administratorrolle entziehen.",

  // System health page.
  "health.heading": "Systemstatus",
  "health.subtitle":
    "Verbindung der Geräte und gemeldete Störungen auf einen Blick.",
  "health.allGood.title": "Alles in Ordnung",
  "health.allGood.body":
    "Alle Geräte melden sich und es liegen keine offenen Störungen vor.",
  "health.attention.title": "{count} Sache(n) brauchen Aufmerksamkeit",
  "health.attention.body": "Eine Übersicht finden Sie unten.",
  "health.offline.heading": "Geräte, die sich nicht melden",
  "health.offline.lastSeen": "Zuletzt gesehen {time}",
  "health.offline.for": "seit {duration} offline",
  "health.offline.unassigned": "Nicht zugewiesenes Gerät",
  "health.issues.heading": "Gemeldete Störungen",
  "health.issues.none": "Keine offenen Störungen.",
  "health.issues.occurrences": "{count}×",
  "health.issues.lastAt": "zuletzt {time}",
  "health.resolve": "Erledigt",
  "health.resolved": "Als erledigt markiert.",
  "health.detail.heading": "Technische Details (nur IT)",
  "health.detail.toggleOpen": "Nur offene anzeigen",
  "health.detail.toggleAll": "Alle anzeigen",
  "health.detail.severity": "Schwere",
  "health.detail.event": "Ereignis",
  "health.detail.message": "Meldung",
  "health.detail.source": "Quelle",
  "health.detail.device": "Gerät",
  "health.detail.count": "Anzahl",
  "health.detail.lastAt": "Zuletzt",
  "health.detail.status": "Status",
  "health.detail.empty": "Keine Ereignisse protokolliert.",
  "health.detail.statusOpen": "Offen",
  "health.detail.statusResolved": "Erledigt",
  "health.sev.info": "Info",
  "health.sev.warning": "Warnung",
  "health.sev.error": "Fehler",
  "health.sev.critical": "Kritisch",
  "health.src.backend": "Server",
  "health.src.tracker": "Gerät",
  "health.src.dashboard": "Dashboard",

  // Plain-language descriptions per event code (for non-technical viewers).
  "health.friendly.ingest.unauthorized":
    "Ein unbekanntes oder gesperrtes Gerät hat versucht, Daten zu senden.",
  "health.friendly.ingest.bad_payload":
    "Ein Gerät hat fehlerhafte Daten gesendet.",
  "health.friendly.enroll.unauthorized":
    "Eine nicht autorisierte Installation hat versucht, sich zu registrieren.",
  "health.friendly.enroll.code_invalid":
    "Ein ungültiger oder abgelaufener Einschreibungs-Code wurde verwendet.",
  "health.friendly.tracker.send_failed":
    "Ein Computer kann den Server nicht erreichen, um Daten zu senden.",
  "health.friendly.tracker.enroll_failed":
    "Die Ersteinrichtung eines Computers ist fehlgeschlagen.",
  "health.friendly.tracker.queue_io":
    "Ein Computer kann seine Daten lokal nicht zwischenspeichern.",
  "health.friendly.dashboard.crash":
    "Im Dashboard ist ein unerwarteter Fehler aufgetreten.",
  "health.friendly.unknown": "Ein Problem wurde gemeldet.",

  // ErrorBoundary fallback.
  "errorBoundary.title": "Etwas ist schiefgelaufen",
  "errorBoundary.body":
    "Dieser Bereich konnte nicht geladen werden. Das Problem wurde automatisch an die IT gemeldet.",
  "errorBoundary.retry": "Erneut versuchen",

  // Auth provisioning gate (user row could not be created/loaded).
  "auth.error.title": "Anmeldung konnte nicht abgeschlossen werden",
  "auth.error.body":
    "Ihr Konto konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  "auth.error.not_allowed":
    "Ihr Konto ist für dieses Dashboard nicht freigeschaltet. Wenden Sie sich an Ihren Administrator.",
  "auth.error.domain_not_allowed":
    "Ihre E-Mail-Domain ist nicht zugelassen. Wenden Sie sich an Ihren Administrator.",
  "auth.error.retry": "Erneut versuchen",

  // Hilfe / FAQ, Status-Tooltips, Einrichtungs-Checkliste, Schutzabfragen.
  "nav.help": "Hilfe",
  "nav.more": "Mehr",

  "help.title": "Hilfe & FAQ",
  "help.subtitle":
    "Häufige Fragen und Lösungen — suchen oder nach Thema stöbern.",
  "help.search": "Hilfe durchsuchen…",
  "help.noResults": "Keine passenden Hilfeartikel.",
  "help.deviceStatus.pending":
    "Wartet auf Freigabe durch eine:n Admin, bevor die Daten gezählt werden.",
  "help.deviceStatus.active": "Freigegeben und meldet normal.",
  "help.deviceStatus.disabled":
    "Von einer:m Admin deaktiviert — meldet und zählt nicht mehr.",

  "faq.section.access": "Anmeldung & Zugriff",
  "faq.section.tracker": "Der Desktop-Tracker",
  "faq.section.integrations": "Integrationen",
  "faq.section.general": "Allgemein",

  "faq.scope.desktop": "Desktop-Tracker",
  "faq.scope.dashboard": "Dashboard",
  "faq.scope.both": "Beides",

  "faq.q.signin_denied": "Jemand kann sich nicht am Dashboard anmelden",
  "faq.a.signin_denied":
    "Der Zugriff wird per E-Mail entschieden. Fügen Sie die E-Mail-Domain unter Einstellungen → Zugriff hinzu, oder die genaue Adresse zu den dauerhaften Admins (ACTIVITYTRACK_ADMIN_EMAILS in Convex). Beim nächsten Anmeldeversuch klappt es.",
  "faq.q.domain": "Wie lasse ich eine ganze Firmendomain zu?",
  "faq.a.domain":
    "Einstellungen → Zugriff → Domain hinzufügen (z. B. example.com). Alle mit dieser E-Mail-Domain können sich als Betrachter anmelden; einzelne Personen unter Einstellungen → Benutzer hochstufen.",
  "faq.q.roles": "Was darf welche Rolle?",
  "faq.a.roles":
    "Betrachter: nur lesende Dashboards. Manager: zusätzlich Personen anlegen/bearbeiten und Geräte zuordnen. IT-Admin: alles, inklusive Benutzer, Zugriff, Gerätefreigabe und Einstellungen.",
  "faq.q.add_admin": "Wie mache ich jemanden zum dauerhaften Admin?",
  "faq.a.add_admin":
    "Dauerhafte Admins stehen in der Convex-Umgebungsvariable ACTIVITYTRACK_ADMIN_EMAILS und können nie ausgesperrt werden. Hinterlegen Sie mindestens eine Chef-E-Mail. Alle anderen lassen sich unter Einstellungen → Benutzer hochstufen.",
  "faq.q.not_reporting": "Ein Computer taucht nicht auf / meldet nicht",
  "faq.a.not_reporting":
    "Prüfen: (1) Tracker installiert und läuft (Infobereich), (2) Gerät erscheint unter Geräte und ist freigegeben (ausstehende Geräte zählen nicht), (3) der Computer hat Internet. Neue Installationen erscheinen als „ausstehend“, bis Sie sie freigeben.",
  "faq.q.offline": "Jemand wird als offline angezeigt, sitzt aber am Platz",
  "faq.a.offline":
    "Ein Gerät gilt als „offline“, wenn es länger als das Offline-Zeitfenster (Einstellungen → Konfiguration) keine Signale sendet. Ursachen: PC im Ruhezustand, nicht im Netzwerk, oder Tracker geschlossen. Es korrigiert sich, sobald der Tracker wieder meldet.",
  "faq.q.enroll_failed":
    "Der Tracker meldet, dass die Registrierung fehlgeschlagen ist",
  "faq.a.enroll_failed":
    "Der einmalige Registrierungscode ist falsch, bereits benutzt oder abgelaufen. Erstellen Sie unter Geräte → Registrierungscodes einen neuen und tragen Sie ihn in die Gerätekonfiguration ein (oder neu installieren mit gültigem Code).",
  "faq.q.debug_password": "Was ist das Tracker-Debug-Passwort?",
  "faq.a.debug_password":
    "Es entsperrt am PC das lokale Status-/Diagnosefenster des Trackers. Setzen oder ändern unter Einstellungen → Konfiguration. Es entsperrt nie das Dashboard — nur die Diagnoseansicht auf dem Gerät.",
  "faq.q.integration_down":
    "Eine Integration (Genesys / Clockodo) wird als nicht verfügbar angezeigt",
  "faq.a.integration_down":
    "Meist abgelaufene oder fehlende API-Zugangsdaten, oder der Anbieter ist nicht erreichbar. Prüfen Sie die Schlüssel in den Convex-Umgebungsvariablen. Das Dashboard arbeitet währenddessen allein mit der Arbeitsplatz-Aktivität weiter.",
  "faq.q.clockodo_setup": "Wie verbinde ich den Clockodo-Webhook?",
  "faq.a.clockodo_setup":
    "Richten Sie den Clockodo-Webhook auf /api/webhooks/clockodo. Beim ersten Speichern sendet Clockodo ein Validierungs-Secret, das einmalig in den Deploy-Logs erscheint — tragen Sie diesen Wert in das Feld „Token“ bei Clockodo ein.",
  "faq.q.privacy": "Was genau wird aufgezeichnet?",
  "faq.a.privacy":
    "Nur die Aktivitätszeit — ob der PC aktiv oder untätig ist und wie lange. Keine Screenshots, keine Tastenanschläge, keine Zwischenablage, keine Dateiinhalte. Erfasst wird die Eingabe-Zeit, nicht der Eingabe-Inhalt.",
  "faq.q.retention": "Wie lange werden Daten gespeichert?",
  "faq.a.retention":
    "Rohdaten werden nach dem Aufbewahrungszeitraum gelöscht (Einstellungen → Konfiguration, Standard 90 Tage). Tagessummen bleiben dauerhaft erhalten, sodass Verlaufsberichte auch nach dem Löschen der Rohdaten bestehen.",
  "faq.q.add_person":
    "Wie füge ich eine:n Mitarbeiter:in hinzu und verknüpfe den Computer?",
  "faq.a.add_person":
    "Personen → Person hinzufügen. Dann Geräte → Gerät öffnen und mit der Person verknüpfen. Nach dem Verknüpfen zeigt das Dashboard den Namen statt des Hostnamens.",
  "faq.q.approve_device": "Ein neues Gerät hängt auf „ausstehend“",
  "faq.a.approve_device":
    "Neue Installationen registrieren sich automatisch als „ausstehend“, damit ohne Ihre Zustimmung nichts erfasst wird. Öffnen Sie Geräte und geben Sie es frei; ab der Freigabe wird die Aktivität gezählt.",

  "health.fix.tracker.send_failed":
    "Der Tracker konnte das Backend nicht erreichen. Meist eine kurze Netzwerkstörung — er versucht es automatisch erneut und behält die Daten. Hält es an, Internet des PCs und die Convex-URL prüfen.",
  "health.fix.tracker.queue_io":
    "Der Tracker konnte seinen lokalen Puffer nicht schreiben (Festplatte voll oder gesperrter ProgramData-Ordner). Freien Speicher auf dem PC prüfen.",
  "health.fix.ingest.bad_tz_offset":
    "Ein Gerät meldete eine unmögliche Zeitzone; das Backend hat sie korrigiert. Harmlos, außer es wiederholt sich — dann Uhrzeit/Zeitzone des PCs prüfen.",
  "health.fix.enroll.code_invalid":
    "Ein Tracker wollte sich mit einem ungültigen oder abgelaufenen Code registrieren. Erstellen Sie unter Geräte einen neuen Registrierungscode.",
  "health.fix.api.internal_error":
    "Der Server des Dashboards hatte einen unerwarteten Fehler (oft fehlende/ungültige Integrationsdaten oder ein Secret). Prüfen Sie die Integrationseinstellungen; Details stehen in den Deploy-Logs.",
  "health.fix.unknown":
    "Siehe die technischen Details unten oder die Hilfeseite. Wenn es weiter auftritt, wenden Sie sich an Ihre:n Administrator:in.",

  "setup.title": "Einrichtung abschließen",
  "setup.subtitle":
    "Noch ein paar Schritte, bis ActivityTrack vollständig läuft.",
  "setup.remaining": "{count} offen",
  "setup.item.access":
    "Festlegen, wer sich anmelden darf (Admins oder erlaubte Domains)",
  "setup.item.approve": "Mindestens ein Gerät freigeben",
  "setup.item.people": "Die erfassten Personen hinzufügen",
  "setup.item.link": "Ein Gerät mit einer Person verknüpfen",
  "setup.item.debugpw": "Das Tracker-Debug-Passwort setzen",

  "users.confirmRole": "Rolle dieser Person ändern?",
  "users.confirmRoleBody":
    "{email} wird zu {role}. Das ändert sofort, was die Person sehen und tun kann.",
  "users.confirmRoleConfirm": "Rolle ändern",

  "error.user.last_admin":
    "Der letzte IT-Admin kann nicht herabgestuft werden — stufen Sie zuerst eine andere Person hoch.",
};
