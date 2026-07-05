import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Ankuendigungen_Termine_Erstellen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Manager+ only (see registry.ts minRole) — no screenshots needed for now.
 */
const IMG = "/guidebooks/ankuendigungen-termine";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Ankuendigungen_Termine_Erstellen.docx`,
    fileName: "Ankuendigungen_Termine_Erstellen.docx",
  },
  sections: [
    {
      id: "ankuendigung",
      title: "Ankündigung erstellen",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Neue Ankündigung öffnen (Editor startet direkt)",
              href: "/announcements?new",
            },
          ],
        },
        {
          kind: "steps",
          items: [
            "Titel und Text eingeben (Rich-Text-Editor mit Formatierung).",
            "Zielgruppe wählen: **„Alle“** oder eine bestimmte Abteilung — die Anzeige **„Erreicht X Personen“** zeigt vorab, wie viele das sehen werden.",
            "Optional **„Oben anheften“** und **„Für Gäste sichtbar“** aktivieren, Anhänge über das Büroklammer-Symbol hinzufügen (bis 5 MB insgesamt).",
            "Über **„Vorschau“** (Augen-Symbol) prüfen, wie es aussieht.",
            "Auf **„Erstellen“** klicken.",
          ],
        },
        {
          kind: "text",
          body: "Terminierung möglich über **„Planen (optional)“** für einen späteren Veröffentlichungszeitpunkt und **„Läuft ab (optional)“**, damit die Ankündigung automatisch verschwindet.",
        },
      ],
    },
    {
      id: "termin",
      title: "Termin im Kalender anlegen",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Neuen Termin öffnen (Dialog startet direkt)",
              href: "/calendar?new",
            },
          ],
        },
        {
          kind: "steps",
          items: [
            "Titel, Ort und Beschreibung sowie Beginn und Ende eintragen.",
            "**„Ganztägig“** aktivieren, falls kein genauer Zeitraum nötig ist.",
            "Zielgruppe wählen: **„Alle“** oder eine bestimmte Abteilung.",
            "**„Für Gäste sichtbar“** aktivieren, wenn auch Gastnutzer den Termin sehen dürfen.",
            "Speichern.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Bestehende Termine lassen sich per Klick öffnen, bearbeiten, duplizieren oder löschen.",
        },
      ],
    },
  ],
};

export function AnkuendigungenTermineGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
