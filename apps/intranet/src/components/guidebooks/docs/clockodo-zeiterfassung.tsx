import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Clockodo_Zeiterfassung.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/clockodo-zeiterfassung/.
 */
const IMG = "/guidebooks/clockodo-zeiterfassung";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Clockodo_Zeiterfassung.docx`,
    fileName: "Clockodo_Zeiterfassung.docx",
  },
  sections: [
    {
      id: "einstempeln",
      title: "Ein- und Ausstempeln",
      blocks: [
        {
          kind: "text",
          body: "Clockodo ist unser Zeiterfassungs-Tool. Damit stempelst du Arbeitsbeginn, Pausen und Feierabend — die Zeiten laufen automatisch in die Auswertung.",
        },
        { kind: "subheading", text: "Am PC (Web-App)" },
        {
          kind: "steps",
          items: [
            "Auf **my.clockodo.com** mit den von der Verwaltung vergebenen Zugangsdaten einloggen.",
            "Oben auf die **Stoppuhr** klicken, um einzustempeln — die Zeit läuft ab sofort.",
            "Am Ende des Arbeitstages wieder auf die **Stoppuhr** klicken, um auszustempeln.",
          ],
        },
        { kind: "subheading", text: "Unterwegs (Mobile App)" },
        {
          kind: "steps",
          items: [
            "Die Clockodo-App aus dem **App Store** bzw. **Play Store** installieren.",
            "Mit den gleichen Zugangsdaten wie am PC einloggen.",
            "Ein-/Ausstempeln funktioniert genauso über die Stoppuhr in der App.",
          ],
        },
      ],
    },
    {
      id: "pause",
      title: "Pause erfassen",
      blocks: [
        {
          kind: "text",
          body: "Sobald du die Stoppuhr anhältst, zählt die Zeit automatisch als Pause. Du musst Pausen also **nicht** separat eintragen — einfach kurz ausstempeln und nach der Pause wieder einstempeln.",
        },
      ],
    },
    {
      id: "urlaub",
      title: "Urlaub & Abwesenheiten beantragen",
      blocks: [
        {
          kind: "text",
          body: "Clockodo ist bei uns auch das **führende System für Abwesenheiten** — Urlaub, Krankheit und Co. werden dort gespeichert. Beantragt werden sie direkt in Clockodo.",
        },
        {
          kind: "steps",
          items: [
            "In Clockodo auf **„Meine Anträge“** gehen.",
            "Über den blauen Button **„+ Abwesenheit“** einen neuen Antrag anlegen.",
            "Abwesenheitstyp auswählen (z. B. Urlaub, Sonderurlaub, Krankheit, Homeoffice) und den Zeitraum angeben.",
            "Optional eine Notiz hinterlegen — privat für die Führungskraft oder öffentlich für alle Kolleg:innen im Abwesenheitsplaner sichtbar.",
            "Antrag absenden — er geht zur Genehmigung an die Führungskraft bzw. Team-Verwaltung.",
          ],
        },
        {
          kind: "callout",
          tone: "info",
          body: "Führungskräfte genehmigen die Anträge in Clockodo. Genehmigte Abwesenheiten erscheinen automatisch im Intranet-Kalender.",
        },
      ],
    },
    {
      id: "korrektur",
      title: "Zeiteintrag nachträglich korrigieren",
      blocks: [
        {
          kind: "text",
          body: "Falls du vergessen hast, dich ein- oder auszustempeln, kannst du den Eintrag im Nachhinein anpassen:",
        },
        {
          kind: "steps",
          items: [
            "In der Web-App zur **„Stundentafel“** wechseln (zeigt alle bereits gebuchten Zeiteinträge).",
            "Den betroffenen Tag bzw. Eintrag anklicken.",
            "Start- und Endzeit korrigieren und speichern.",
          ],
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
              label: "Clockodo-Login",
              href: "https://my.clockodo.com/de/login",
            },
            {
              label: "Clockodo Help Center",
              href: "https://support.clockodo.com/de/help-center",
            },
            {
              label: "Digitale Stempeluhr — Funktionsübersicht",
              href: "https://www.clockodo.com/de/funktionen/digitale-stempeluhr/",
            },
            {
              label: "Zeiterfassung im Browser — Funktionsübersicht",
              href: "https://www.clockodo.com/de/funktionen/zeiterfassung-im-browser/",
            },
            {
              label: "Wie trage ich Urlaub in Clockodo ein?",
              href: "https://support.clockodo.com/de/help-center/wie-kann-man-urlaub-eintragen",
            },
            {
              label: "Passwort vergessen (Clockodo)",
              href: "https://my.clockodo.com/de/users/newpassword/",
            },
          ],
        },
      ],
    },
  ],
};

export function ClockodoZeiterfassungGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
