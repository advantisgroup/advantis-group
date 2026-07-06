import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Passwoerter_Browser.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/passwoerter-browser/.
 */
const IMG = "/guidebooks/passwoerter-browser";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Passwoerter_Browser.docx`,
    fileName: "Passwoerter_Browser.docx",
  },
  sections: [
    {
      id: "chrome",
      title: "Passwörter in Chrome verwalten",
      blocks: [
        {
          kind: "text",
          body: "Direktzugriff: **chrome://settings/passwords** in die Adressleiste eingeben. Alternativ: Drei-Punkte-Menü (oben rechts) → „Passwörter und Autofill“ → „Google Passwortmanager“.",
        },
        {
          kind: "steps",
          items: [
            "Gewünschtes Passwort in der Liste auswählen.",
            "Rechts daneben auf das Augen-Symbol **„Passwort anzeigen“** klicken (Windows-Anmeldung bestätigen).",
            "Zum Ändern auf **„Bearbeiten“** klicken, Passwort anpassen und **„Speichern“**.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Beim Anlegen eines neuen Kontos schlägt Chrome automatisch ein starkes, einzigartiges Passwort vor („Passwortvorschlag“) — einfach übernehmen, Chrome merkt es sich dann selbst.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Der eingebaute „Password Checkup“ prüft laufend im Hintergrund, ob gespeicherte Zugangsdaten in bekannten Datenlecks aufgetaucht, mehrfach verwendet oder einfach zu erraten sind, und warnt euch direkt im Passwortmanager.",
        },
      ],
    },
    {
      id: "edge",
      title: "Passwörter in Edge verwalten",
      blocks: [
        {
          kind: "text",
          body: "Direktzugriff: **edge://settings/passwords** in die Adressleiste eingeben. Alternativ: „…“-Menü → „Einstellungen“ → „Passwörter“.",
        },
        {
          kind: "text",
          body: "Für jede gespeicherte Website/jeden Benutzernamen rechts auf das Augen-Symbol klicken, um das Passwort einzusehen (Windows-Anmeldung bestätigen).",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Der Microsoft Passwort-Manager synchronisiert Passwörter geräteübergreifend nur, wenn ihr in Edge mit einem **persönlichen Microsoft-Konto-Profil** angemeldet seid.",
        },
        {
          kind: "text",
          body: "Unter **Einstellungen → Passwörter** die **„Kennwortüberwachung“** aktivieren, um regelmäßig geprüft zu werden, ob gespeicherte Zugangsdaten in einem Datenleck aufgetaucht sind.",
        },
        {
          kind: "text",
          body: "Unter **Einstellungen → Passwörter und automatische Ausfüllfunktion → Microsoft Passwort-Manager → Weitere Einstellungen** den Schalter **„Starke Passwörter vorschlagen“** aktivieren — Edge schlägt dann bei neuen Konten automatisch ein sicheres Passwort vor.",
        },
      ],
    },
    {
      id: "sicherheit",
      title: "Sicherheitstipps",
      blocks: [
        {
          kind: "callout",
          tone: "warning",
          body: "Für Firmenkonten (Outlook, IONOS, Clockodo, Intranet) **niemals** das gleiche Passwort wie für private Konten verwenden. Der Passwort-Manager im Browser merkt sich für jeden Dienst ein eigenes, starkes Passwort — ihr müsst es euch nicht selbst merken.",
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
              label: "Passwörter in Chrome verwalten",
              href: "https://support.google.com/chrome/answer/95606?hl=de",
            },
            {
              label: "Kompromittierte Passwörter im Google-Konto ändern",
              href: "https://support.google.com/accounts/answer/9457609?hl=de",
            },
            {
              label: "Passwörter in Microsoft Edge anzeigen/bearbeiten",
              href: "https://support.microsoft.com/de-de/accounts-billing/manage/view-or-edit-your-passwords-in-microsoft-password-manager",
            },
            {
              label: "Kennwortüberwachung in Microsoft Edge verwenden",
              href: "https://support.microsoft.com/de-de/edge/use-password-monitor-to-help-protect-your-passwords-in-microsoft-edge",
            },
            {
              label: "Kennwortgenerator in Microsoft Edge verwenden",
              href: "https://support.microsoft.com/de-de/edge/use-password-generator-to-create-more-secure-passwords-in-microsoft-edge",
            },
          ],
        },
      ],
    },
  ],
};

export function PasswoerterBrowserGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
