import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Abwesenheiten_Genehmigen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Manager+ only (see registry.ts minRole) — no screenshots needed for now.
 */
const IMG = "/guidebooks/abwesenheiten-genehmigen";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Abwesenheiten_Genehmigen.docx`,
    fileName: "Abwesenheiten_Genehmigen.docx",
  },
  sections: [
    {
      id: "antraege-entscheiden",
      title: "Anträge einsehen & entscheiden",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Zu den Abwesenheiten (Reiter „Genehmigungen“)",
              href: "/clockodo/approvals",
            },
          ],
        },
        {
          kind: "text",
          body: "Jeder offene Antrag zeigt Name, Abteilung, Art, Zeitraum, Anzahl Arbeitstage und eine optionale Begründung. Rechts daneben zwei Buttons: **„Ablehnen“** und **„Genehmigen“**.",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Ein Klick entscheidet sofort — es gibt keine Rückfrage und kein Notizfeld. Soll die Person wissen, warum ein Antrag abgelehnt wurde, schreib ihr kurz im Chat.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Mit Team-Zugriff auf Clockodo siehst du alle offenen Anträge im Unternehmen. Deine eigenen Anträge kannst du nicht selbst genehmigen. Dieselben Anträge stehen auch unter **„Freigaben“** in der Seitenleiste.",
        },
      ],
    },
    {
      id: "clockodo-vs-intranet",
      title: "Alles landet in Clockodo",
      blocks: [
        {
          kind: "text",
          body: "Abwesenheiten werden direkt in Clockodo gespeichert — egal ob sie im Intranet oder in Clockodo selbst beantragt wurden. Hier erscheinen deshalb alle offenen Anträge, und deine Entscheidung gilt sofort auch in Clockodo.",
        },
      ],
    },
    {
      id: "ueberblick",
      title: "Überblick behalten",
      blocks: [
        {
          kind: "text",
          body: "Oben im Reiter „Genehmigungen“ zeigt **„Abwesend in den nächsten 14 Tagen“** auf einen Blick, wer aus deinem Team in den kommenden zwei Wochen weg ist.",
        },
      ],
    },
  ],
};

export function AbwesenheitenGenehmigenGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
