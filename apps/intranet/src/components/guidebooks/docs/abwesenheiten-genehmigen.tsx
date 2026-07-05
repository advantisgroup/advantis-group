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
              href: "/absences",
            },
          ],
        },
        {
          kind: "text",
          body: "Jeder offene Antrag zeigt Name, Abteilung, Zeitraum, Anzahl Arbeitstage und eine optionale Begründung. Rechts daneben zwei Buttons: **„Ablehnen“** (Rahmen-Button) und **„Genehmigen“** (ausgefüllter Button).",
        },
        {
          kind: "text",
          body: "„Ablehnen“ öffnet den Dialog **„Antrag ablehnen“** mit einem optionalen Notizfeld für die betroffene Person — danach mit dem roten **„Ablehnen“**-Button bestätigen.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Als Führungskraft seht ihr hier nur Anträge eurer direkten Teammitglieder. Admins sehen alle Anträge im Unternehmen.",
        },
      ],
    },
    {
      id: "clockodo-vs-intranet",
      title: "Clockodo- vs. Intranet-Anträge",
      blocks: [
        {
          kind: "callout",
          tone: "warning",
          body: "Anträge mit dem Clockodo-Symbol sind aus Clockodo synchronisiert und hier schreibgeschützt — „Genehmigen“/„Ablehnen“ funktioniert nur bei Anträgen, die direkt im Intranet gestellt wurden. Clockodo-Anträge werden in Clockodo selbst entschieden (siehe Guidebook „Zeiterfassung mit Clockodo“).",
        },
      ],
    },
    {
      id: "ueberblick",
      title: "Überblick behalten",
      blocks: [
        {
          kind: "text",
          body: "Oben im Reiter „Genehmigungen“ zeigt **„Abwesend in den nächsten 14 Tagen“** auf einen Blick, wer aus eurem Team in den kommenden zwei Wochen weg ist.",
        },
      ],
    },
  ],
};

export function AbwesenheitenGenehmigenGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
