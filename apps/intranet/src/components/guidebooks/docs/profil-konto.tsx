import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Profil_Konto_Benachrichtigungen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots will follow later in /public/guidebooks/profil-konto/.
 */
const IMG = "/guidebooks/profil-konto";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Profil_Konto_Benachrichtigungen.docx`,
    fileName: "Profil_Konto_Benachrichtigungen.docx",
  },
  sections: [
    {
      id: "profil",
      title: "Profil vervollständigen",
      blocks: [
        {
          kind: "steps",
          items: [
            "Auf das Profilbild oben klicken und ein Foto auswählen — es wird automatisch quadratisch zugeschnitten; im Vorschau-Dialog bestätigen.",
            "Vorname, Nachname, Position, Abteilung und Telefonnummer ausfüllen.",
            "Auf **„Speichern“** klicken.",
          ],
        },
        {
          kind: "text",
          body: "Die Vollständigkeits-Anzeige zeigt, wie viele der Angaben (Foto, Position, Abteilung, Telefonnummer) noch fehlen, damit Kolleg:innen dich leichter finden und erreichen.",
        },
      ],
    },
    {
      id: "konto-sicherheit",
      title: "Konto & Sicherheit",
      blocks: [
        {
          kind: "text",
          body: "Über **„Konto & Sicherheit verwalten“** öffnet sich der Kontobereich für Passwort, Zwei-Faktor-Authentisierung und aktive Sitzungen/Geräte.",
        },
      ],
    },
    {
      id: "verknuepfungen",
      title: "Verknüpfungen prüfen",
      blocks: [
        {
          kind: "text",
          body: "Zeigt, ob dein Konto mit Clockodo verknüpft ist — direkt oder über einen ActivityTrack-Eintrag. Nur wenn hier **„Verknüpft“** steht, synchronisieren deine Abwesenheiten automatisch aus Clockodo.",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Steht dort **„Nicht verknüpft“**, bitte einen Admin, dein Clockodo-Konto zu verknüpfen — sonst tauchen deine Abwesenheiten nicht automatisch im Intranet auf (siehe Guidebook „Zeiterfassung mit Clockodo“).",
        },
      ],
    },
    {
      id: "benachrichtigungen",
      title: "Benachrichtigungen einstellen",
      blocks: [
        {
          kind: "text",
          body: "Browser-Benachrichtigungen lassen sich separat aktivieren (der Browser fragt dabei einmalig um Erlaubnis).",
        },
        {
          kind: "text",
          body: "Für jeden Typ gibt es einen eigenen Schalter: Abwesenheitsanträge (zu genehmigen), Entscheidungen zu Abwesenheiten, Ankündigungen sowie Upload-Anfragen und -Entscheidungen.",
        },
      ],
    },
    {
      id: "app-einstellungen",
      title: "App-Einstellungen",
      blocks: [
        {
          kind: "text",
          body: "Standard-Kalenderansicht, Startseite nach dem Login, Wochenbeginn (Montag/Sonntag), Sprache und Darstellung (Hell/Dunkel/System) lassen sich hier festlegen — die Einstellungen gelten auf allen Geräten.",
        },
      ],
    },
  ],
};

export function ProfilKontoGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
