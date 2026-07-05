import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Verwaltung_Mitglieder_Zugang.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Manager+ only (see registry.ts minRole) — no screenshots needed for now.
 */
const IMG = "/guidebooks/verwaltung-mitglieder";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Verwaltung_Mitglieder_Zugang.docx`,
    fileName: "Verwaltung_Mitglieder_Zugang.docx",
  },
  sections: [
    {
      id: "zugangsanfragen",
      title: "Zugangsanfragen prüfen",
      blocks: [
        {
          kind: "links",
          items: [
            { label: "Zugangsanfragen öffnen", href: "/admin?tab=requests" },
          ],
        },
        {
          kind: "text",
          body: "Für jede Anfrage: Rolle über das Dropdown auswählen (Standard **„Mitarbeiter“** — die Rolle „Admin“ könnt ihr als Führungskraft nicht vergeben, das ist Admins vorbehalten), dann **„Ablehnen“** oder **„Genehmigen“** klicken.",
        },
      ],
    },
    {
      id: "einladen",
      title: "Neue Mitarbeiter einladen",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Einladungen öffnen", href: "/admin?tab=invites" }],
        },
        {
          kind: "text",
          body: "E-Mail-Adresse eingeben, Rolle wählen, auf **„Einladung senden“** klicken (Briefumschlag-Icon). Firmen-E-Mail-Adressen funktionieren direkt.",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Externe E-Mail-Adressen (andere Domain als die Firma) könnt ihr als Führungskraft nicht einladen — nur Admins dürfen das, nach einer zusätzlichen Bestätigung.",
        },
        {
          kind: "text",
          body: "Offene Einladungen lassen sich per **„Erneut senden“** nochmal zustellen oder per **„Widerrufen“** zurückziehen.",
        },
      ],
    },
    {
      id: "mitglieder",
      title: "Mitglieder verwalten",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Mitglieder öffnen", href: "/admin?tab=members" }],
        },
        {
          kind: "text",
          body: "Liste aller Mitglieder mit Suche sowie Filtern nach Rolle, Status und Team. Über das **„⋮“-Menü** pro Person: Profil ansehen, E-Mail kopieren, Upload-Anfragen erlauben/sperren.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Rolle ändern, Geschäftsführungs-Zugriff gewähren, erneut einladen sowie ein Konto sperren oder entfernen sind **Admin-only** — als Führungskraft seht ihr diese Menüpunkte nicht.",
        },
      ],
    },
  ],
};

export function VerwaltungMitgliederGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
