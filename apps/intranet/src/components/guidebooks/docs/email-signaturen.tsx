import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Email_Signaturen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/email-signaturen/.
 */
const IMG = "/guidebooks/email-signaturen";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Email_Signaturen.docx`,
    fileName: "Email_Signaturen.docx",
  },
  sections: [
    {
      id: "outlook-desktop",
      title: "E-Mail-Signatur in Outlook einrichten",
      blocks: [
        {
          kind: "text",
          body: "Eine Signatur muss einmal eingerichtet werden und wird danach automatisch unter jede neue E-Mail (und optional unter Antworten/Weiterleitungen) gesetzt.",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Desktop-Outlook und Outlook im Browser teilen sich die Signatur **nicht** — wer beides nutzt, muss sie zweimal einrichten.",
        },
        { kind: "subheading", text: "Klassisches Outlook (Desktop)" },
        {
          kind: "steps",
          items: [
            "Oben links auf **„Datei“** klicken, dann **„Optionen“** → **„E-Mail“** → **„Signaturen“**.",
            "Im Fenster **„Signaturen und Briefpapier“** auf **„Neu“** klicken und der Signatur einen Namen geben, z. B. „Advantis Standard“.",
            "Im großen Textfeld die Signatur eintippen und formatieren (Schriftart, Farbe, später auch ein Bild einfügen).",
            "Unten bei **„Standardsignatur auswählen“** das richtige E-Mail-Konto auswählen und die Signatur sowohl bei **„Neue Nachrichten“** als auch bei **„Antworten/Weiterleitungen“** zuweisen.",
            "Auf **„Speichern“**, dann zweimal **„OK“** klicken.",
          ],
        },
        { kind: "subheading", text: "Neues Outlook („New Outlook“)" },
        {
          kind: "steps",
          items: [
            "Oben rechts auf das **Zahnrad „Einstellungen“** klicken.",
            "**„Konten“** → **„Signaturen“** öffnen (je nach Version auch unter „E-Mail“ → „Verfassen und antworten“ zu finden).",
            "Auf **„Signatur hinzufügen“** klicken, einen Namen vergeben und den Text im Editor eingeben.",
            "Die Häkchen setzen, damit die Signatur automatisch bei **neuen Nachrichten** und bei **Antworten/Weiterleitungen** verwendet wird.",
          ],
        },
      ],
    },
    {
      id: "outlook-web",
      title: "Signatur in Outlook im Browser (OWA) erstellen",
      blocks: [
        {
          kind: "steps",
          items: [
            "Auf **outlook.office.com** bzw. **outlook.com** einloggen.",
            "Oben rechts auf das **Zahnrad** klicken und **„Alle Outlook-Einstellungen anzeigen“** auswählen.",
            "Zu **„E-Mail“ → „Verfassen und antworten“** navigieren (in manchen Postfächern liegt die Signatur stattdessen direkt unter **„Konto“**).",
            "Im Signatur-Editor den Text eingeben und formatieren.",
            "Beide Häkchen setzen: Signatur für **neue Nachrichten** UND für **Antworten/Weiterleitungen** verwenden.",
            "Auf **„Speichern“** klicken.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Wer sowohl das Desktop-Outlook als auch Outlook im Browser nutzt, muss die Signatur wie oben beschrieben in **beiden** Programmen getrennt einrichten.",
        },
      ],
    },
    {
      id: "ionos-webmail",
      title: "Signatur im IONOS-Webmail erstellen",
      blocks: [
        {
          kind: "steps",
          items: [
            "Auf **webmail.ionos.de** (bzw. der für euer Postfach gültigen IONOS-Webmail-Adresse) einloggen.",
            "Oben rechts auf das **Zahnrad-Symbol** klicken und **„Alle Einstellungen“** auswählen.",
            "Im Menü **„Mail“** den Punkt **„Signaturen“** auswählen.",
          ],
        },
        { kind: "subheading", text: "Option A — Vorlage nutzen (empfohlen)" },
        {
          kind: "text",
          body: "Auf **„Neu aus Vorlage“** klicken und ein Design auswählen. Die Vorlagen haben bereits Platz für Name, Position und Logo vorgesehen — Bilder können direkt im Editor hochgeladen werden, sobald sie bereitstehen.",
        },
        { kind: "subheading", text: "Option B — Eigene Signatur ohne Vorlage" },
        {
          kind: "text",
          body: "Über **„+ Neue Signatur“** eine leere Signatur anlegen, ihr einen Namen geben und den Text (optional mit Bildern oder eigenem HTML) im Editor eingeben.",
        },
        {
          kind: "text",
          body: "**Standardsignatur festlegen:** Unter „Standardsignatur“ die neue Signatur für neue E-Mails auswählen und unter „Standardsignatur für Antworten oder Weiterleitungen“ ebenfalls zuweisen. Danach auf **„Speichern“** klicken — die Signatur wird ab sofort automatisch eingefügt.",
        },
      ],
    },
    {
      id: "tipps",
      title: "Tipps für eine einheitliche Signatur",
      blocks: [
        {
          kind: "callout",
          tone: "warning",
          body: "**Rechtliche Pflichtangaben:** Geschäftsmails benötigen meist Pflichtangaben (Firmenname, Rechtsform, Sitz, Registergericht, Handelsregisternummer, Geschäftsführung, USt-IdNr.). Den genauen, aktuell gültigen Wortlaut bitte bei der Geschäftsführung/Verwaltung erfragen — nicht selbst frei formulieren.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "**Einheitliches Aussehen:** Wenn möglich die gleiche Schriftart, Farbe und das Firmenlogo wie die Kolleg:innen verwenden — das wirkt professioneller nach außen.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Diese Anleitung wird in Kürze um Screenshots und das offizielle Logo ergänzt.",
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
              label: "Outlook für Windows: Signaturen und automatische Antworten erstellen",
              href: "https://support.microsoft.com/en-us/office/create-signatures-and-automatic-replies-in-outlook-for-windows-1528addb-bd2e-43c5-86f6-d8de5ff13ae9",
            },
            {
              label: "Signatur in Outlook erstellen und hinzufügen",
              href: "https://support.microsoft.com/en-us/office/create-and-add-an-email-signature-in-outlook-776d9006-abdf-444e-b5b7-a61821dff034",
            },
            {
              label: "Anmelden und Signatur für Outlook im Web erstellen",
              href: "https://support.microsoft.com/en-us/office/sign-in-and-create-a-signature-for-outlook-on-the-web-676b32bc-b486-468d-b1f2-883569298b58",
            },
            {
              label: "IONOS-Hilfe: Signaturen im IONOS-Webmail erstellen",
              href: "https://www.ionos.com/help/email/using-webmail/creating-signatures-in-ionos-webmail/",
            },
            {
              label: "IONOS Digital Guide: E-Mail-Signatur erstellen — Schritt für Schritt",
              href: "https://www.ionos.com/digitalguide/e-mail/technical-matters/create-an-e-mail-signature/",
            },
          ],
        },
      ],
    },
  ],
};

export function EmailSignaturenGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
