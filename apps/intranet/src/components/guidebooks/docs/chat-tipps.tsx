import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Chat_Gruppen_Nachrichten.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/chat-tipps/.
 */
const IMG = "/guidebooks/chat-tipps";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Chat_Gruppen_Nachrichten.docx`,
    fileName: "Chat_Gruppen_Nachrichten.docx",
  },
  sections: [
    {
      id: "neue-unterhaltung",
      title: "Neue Unterhaltung starten",
      blocks: [
        {
          kind: "steps",
          items: [
            "Oben in der Chat-Liste auf **„+“** klicken.",
            "Für eine Direktnachricht direkt auf eine Person klicken.",
            "Für eine Gruppe auf **„Neue Gruppe“** wechseln, einen Gruppennamen eingeben, Mitglieder über die Checkboxen auswählen und auf **„Erstellen“** klicken.",
          ],
        },
      ],
    },
    {
      id: "nachrichten-senden",
      title: "Nachrichten senden",
      blocks: [
        {
          kind: "text",
          body: "**Enter** sendet die Nachricht, **Umschalt+Enter** fügt einen Zeilenumbruch ein. Mit **@** könnt ihr Kolleg:innen direkt in der Nachricht erwähnen — Vorschläge erscheinen automatisch.",
        },
        {
          kind: "text",
          body: "In der Leiste über dem Textfeld: **Büroklammer**-Symbol zum Anhängen von Dateien vom Gerät, **Wolken**-Symbol für Dateien direkt aus OneDrive, **Smiley**-Symbol für den Emoji-Picker.",
        },
      ],
    },
    {
      id: "reagieren-antworten",
      title: "Auf Nachrichten reagieren & antworten",
      blocks: [
        {
          kind: "text",
          body: "Beim Überfahren einer Nachricht mit der Maus erscheinen rechts eine Reaktion (Emoji) und ein **„⋮“-Menü** mit Antworten und Kopieren sowie — nur bei eigenen Nachrichten — Bearbeiten und Löschen.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Gelöschte Nachrichten werden für alle in der Unterhaltung entfernt — das lässt sich nicht rückgängig machen.",
        },
      ],
    },
    {
      id: "unterhaltungen-organisieren",
      title: "Unterhaltungen organisieren",
      blocks: [
        {
          kind: "text",
          body: "Über das Suchfeld oben lassen sich Unterhaltungen filtern. Jede Zeile hat beim Überfahren ein **„⋮“-Menü** mit: Oben anheften/Lösen, Stummschalten/Stummschaltung aufheben, Archivieren/Aus Archiv holen.",
        },
      ],
    },
    {
      id: "gruppen-verwalten",
      title: "Gruppen verwalten",
      blocks: [
        {
          kind: "text",
          body: "Ein Klick auf den Gruppennamen bzw. das Gruppenfoto öffnet die **„Gruppeneinstellungen“** mit drei Reitern:",
        },
        { kind: "subheading", text: "Info" },
        {
          kind: "text",
          body: "Gruppenfoto ändern oder entfernen und den Gruppennamen umbenennen.",
        },
        { kind: "subheading", text: "Mitglieder" },
        {
          kind: "text",
          body: "Weitere Mitglieder hinzufügen oder bestehende entfernen.",
        },
        { kind: "subheading", text: "Medien" },
        {
          kind: "text",
          body: "Alle in der Gruppe geteilten Fotos und Dateien an einem Ort.",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Eine Gruppe zu löschen entfernt sie inklusive aller Nachrichten dauerhaft für alle — das lässt sich nicht rückgängig machen. Um nur selbst auszutreten, ohne die Gruppe zu löschen, gibt es separat **„Gruppe verlassen“**.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Verlässt man einen 1:1-Chat, bleibt er noch 48 Stunden bestehen, falls man erneut eingeladen wird und wieder beitreten möchte.",
        },
      ],
    },
  ],
};

export function ChatTippsGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
