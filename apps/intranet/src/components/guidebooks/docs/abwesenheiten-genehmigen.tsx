import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Approving absences in the Zeiterfassung (Verwaltung → Freigaben).
 * Content is intentionally German-only, like the other guidebooks.
 * Manager+ only (see registry.ts minRole) — no screenshots needed for now.
 */
const DOC: DocContent = {
  sections: [
    {
      id: "antraege-entscheiden",
      title: "Anträge einsehen & entscheiden",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Zu den Freigaben (Zeiterfassung → Verwaltung)",
              href: "/zeiterfassung/admin?section=approvals",
            },
          ],
        },
        {
          kind: "text",
          body: "Unter **Zeiterfassung → Verwaltung → Freigaben** stehen alle offenen Abwesenheitsanträge und Korrekturen der Arbeitszeit. Jeder Antrag zeigt Name, Art und Zeitraum. Rechts daneben zwei Buttons: **„Ablehnen“** und **„Freigeben“**.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Beim Ablehnen kannst du eine Begründung eintragen — die Person sieht sie bei ihrem Antrag.",
        },
      ],
    },
    {
      id: "ueberschneidungen",
      title: "Wer ist gleichzeitig weg?",
      blocks: [
        {
          kind: "text",
          body: "Bei jedem Urlaubsantrag steht, wer im selben Zeitraum abwesend ist. Kolleg:innen aus demselben Team und Teamleitungen stehen oben und sind markiert. Gesperrt wird nichts — du entscheidest selbst.",
        },
      ],
    },
  ],
};

export function AbwesenheitenGenehmigenGuidebook() {
  return <DocViewer doc={DOC} />;
}
