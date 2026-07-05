import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Kalender_Termine.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/kalender/.
 */
const IMG = "/guidebooks/kalender";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Kalender_Termine.docx`,
    fileName: "Kalender_Termine.docx",
  },
  sections: [
    {
      id: "ansicht",
      title: "Ansicht wechseln & navigieren",
      blocks: [
        {
          kind: "text",
          body: "Oben rechts zwischen **Monat**, **Woche** und **Agenda** wechseln. **„Heute“** springt zum aktuellen Datum, die Pfeile blättern einen Zeitraum weiter/zurück, **„Zu Datum springen“** öffnet eine Datumsauswahl.",
        },
        {
          kind: "shortcuts",
          items: [
            { action: "Vorherigen Zeitraum anzeigen", keys: ["←"] },
            { action: "Nächsten Zeitraum anzeigen", keys: ["→"] },
            { action: "Zu heute springen", keys: ["T"] },
          ],
        },
      ],
    },
    {
      id: "termin-erstellen",
      title: "Termin erstellen & bearbeiten",
      blocks: [
        {
          kind: "steps",
          items: [
            "Auf **„Neuer Termin“** klicken oder direkt auf einen Tag im Kalender klicken.",
            "Titel, Ort und Beschreibung sowie Beginn und Ende eintragen.",
            "**„Ganztägig“** aktivieren, falls kein genauer Zeitraum nötig ist.",
            "**„Für Gäste sichtbar“** aktivieren, wenn auch Gastnutzer den Termin sehen dürfen.",
            "Speichern.",
          ],
        },
        {
          kind: "text",
          body: "Bestehende Termine lassen sich per Klick öffnen, bearbeiten, duplizieren oder löschen.",
        },
      ],
    },
    {
      id: "abwesenheiten-anzeigen",
      title: "Abwesenheiten im Kalender",
      blocks: [
        {
          kind: "text",
          body: "Genehmigte Abwesenheiten erscheinen automatisch im Kalender — sie stammen entweder aus Clockodo oder aus direkten Anträgen im Intranet (siehe Guidebook „Zeiterfassung mit Clockodo“).",
        },
        {
          kind: "text",
          body: "Mit **„Nur meine Abwesenheiten“** blendet ihr die Einträge der Kolleg:innen aus, über den Abteilungsfilter (**„Alle Abteilungen“**) filtert ihr nach Team. Die Legende erklärt die Farben, und die Zahl neben einem Tag zeigt, wie viele Personen an dem Tag abwesend sind.",
        },
      ],
    },
    {
      id: "export",
      title: "Kalender exportieren (.ics)",
      blocks: [
        {
          kind: "text",
          body: "Über das Export-Symbol lässt sich die aktuell sichtbare Ansicht (Termine + Abwesenheiten) als **.ics-Datei** herunterladen — praktisch, um sie in Outlook oder eine andere Kalender-App zu importieren.",
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
              label: "Kalender nach Outlook importieren",
              href: "https://support.microsoft.com/de-de/office/kalender-nach-outlook-importieren-8e8364e1-400e-4c0f-a573-fe76b5a2d379",
            },
          ],
        },
      ],
    },
  ],
};

export function KalenderGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
