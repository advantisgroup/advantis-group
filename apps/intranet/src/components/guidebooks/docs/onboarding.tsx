import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Onboarding_Checkliste.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Ties together the other guidebooks rather than duplicating their steps.
 */
const IMG = "/guidebooks/onboarding";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Onboarding_Checkliste.docx`,
    fileName: "Onboarding_Checkliste.docx",
  },
  sections: [
    {
      id: "erste-schritte",
      title: "Erste Schritte am ersten Tag",
      blocks: [
        {
          kind: "steps",
          items: [
            "Mit der Firmen-E-Mail-Adresse im Intranet anmelden.",
            "Unter **„Einstellungen“** das Profil vervollständigen (Profilbild, Kontaktdaten).",
            "Unter **„Einstellungen“ → „Benachrichtigungen“** festlegen, worüber du informiert werden willst.",
          ],
        },
      ],
    },
    {
      id: "e-mail-kalender",
      title: "E-Mail, Kalender & Signatur",
      blocks: [
        {
          kind: "text",
          body: "Die Zugangsdaten für Outlook und/oder das IONOS-Postfach bekommst du von der IT/Verwaltung.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Sobald du eingeloggt bist, richte direkt deine Signatur ein — die genaue Anleitung dafür steht im Guidebook **„E-Mail-Signatur — Outlook & IONOS“**.",
        },
      ],
    },
    {
      id: "zeiterfassung",
      title: "Zeiterfassung",
      blocks: [
        {
          kind: "text",
          body: "Deine Arbeitszeit erfasst du direkt im Intranet: Seitenleiste **„Zeiterfassung“** — dort stempelst du ein und aus, machst Pausen und siehst dein Stundenkonto. Ein eigener Zugang ist nicht nötig.",
        },
      ],
    },
    {
      id: "dateien-tools",
      title: "Dateien, Tools & Kolleg:innen finden",
      blocks: [
        {
          kind: "steps",
          items: [
            "**OneDrive:** Zugriff auf den gemeinsamen „Team“-Ordner einrichten — siehe Guidebook „OneDrive — Schulung“.",
            "**Directory („Mitarbeiter“):** Hier findest du Kontaktdaten und Teams aller Kolleg:innen.",
            "**Chat:** Für die Team-Kommunikation nutzen — Gruppen kannst du direkt im Intranet erstellen.",
            "**Kalender:** Für Termine, Meetings und Abwesenheiten anderer im Blick behalten.",
          ],
        },
      ],
    },
    {
      id: "abwesenheiten",
      title: "Abwesenheiten & Urlaub",
      blocks: [
        {
          kind: "text",
          body: "Urlaub, Krankheit & Co. beantragst du in der Zeiterfassung im Intranet.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Seitenleiste **„Zeiterfassung“** → **„Abwesenheiten“**. Dort siehst du auch deine genommenen Urlaubstage und den Status aller Anträge.",
        },
      ],
    },
    {
      id: "hilfe",
      title: "Wenn etwas nicht funktioniert",
      blocks: [
        {
          kind: "callout",
          tone: "info",
          body: "Bei Problemen mit Audio, Bildschirm, Internet oder Browser hilft meist das Guidebook **„Problembehandlung — IT & Arbeitsplatz“** weiter.",
        },
      ],
    },
    {
      id: "links",
      title: "Nützliche Links",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Outlook im Browser anmelden",
              href: "https://outlook.office.com/mail/",
            },
            {
              label: "IONOS-Webmail anmelden",
              href: "https://webmail.ionos.de/",
            },
            {
              label: "OneDrive — Advantis GmbH",
              href: "https://onedrive.live.com/?id=/personal/D14F15B8672B5E84/Documents/Advantis%20GmbH",
            },
          ],
        },
      ],
    },
  ],
};

export function OnboardingGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
