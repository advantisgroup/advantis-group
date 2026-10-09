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
          items: [{ label: "Zugangsanfragen öffnen", href: "/admin/requests" }],
        },
        {
          kind: "text",
          body: "Für jede Anfrage: Rolle über das Dropdown auswählen (Standard **„Mitarbeiter“** — die Rolle „Admin“ kannst du als Führungskraft nicht vergeben, das ist Admins vorbehalten), dann **„Ablehnen“** oder **„Genehmigen“** klicken.",
        },
      ],
    },
    {
      id: "einladen",
      title: "Neue Mitarbeiter einladen",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Einladungen öffnen", href: "/admin/invites" }],
        },
        {
          kind: "text",
          body: "E-Mail-Adresse eingeben, Rolle wählen, auf **„Einladung senden“** klicken (Briefumschlag-Icon).",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Für die private E-Mail-Adresse der neuen Person einladen, nicht auf eine Firmenadresse warten. Für den Intranet-Zugang macht das keinen Unterschied — die Person meldet sich einfach mit der eingeladenen Adresse an. Damit kann es sofort losgehen, statt erst mit IT eine Firmen-Mailbox einzurichten. Eine Firmenadresse kann später jederzeit ergänzt werden, falls gewünscht.",
        },
        {
          kind: "text",
          body: "Bei einer externen Adresse (andere Domain als die Firma — was bei einer privaten E-Mail immer der Fall ist) fragt das System nochmal extra nach, bevor die Einladung rausgeht. Das gilt für Führungskräfte genauso wie für Admins.",
        },
        {
          kind: "text",
          body: "Offene Einladungen lassen sich per **„Erneut senden“** nochmal zustellen oder per **„Widerrufen“** zurückziehen.",
        },
      ],
    },
    {
      id: "danach",
      title: "Danach: was die neue Person selbst erledigt",
      blocks: [
        {
          kind: "text",
          body: "Abteilung, Team und Jobtitel trägt sich jede:r beim ersten Login selbst im eigenen Profil ein — dafür musst du nichts tun. Die vollständige Checkliste für den ersten Tag steht im Guidebook **„Onboarding“**.",
        },
        {
          kind: "links",
          items: [{ label: "Onboarding-Guidebook öffnen", href: "/guidebooks/onboarding" }],
        },
      ],
    },
    {
      id: "zeiterfassung",
      title: "Zeiterfassung einrichten",
      blocks: [
        {
          kind: "callout",
          tone: "info",
          body: "Die Zeiterfassung läuft im Intranet — ein eigenes Konto in einem anderen System ist nicht nötig. Neue Mitarbeiter brauchen nur ein Arbeitszeitmodell und ihren Urlaubsanspruch.",
        },
        {
          kind: "links",
          items: [{ label: "Zeiterfassung-Verwaltung öffnen", href: "/zeiterfassung/admin" }],
        },
        {
          kind: "steps",
          items: [
            "Unter „Mitarbeitende“ die Person öffnen.",
            "Im Reiter „Einstellungen“ das Arbeitszeitmodell (Stunden pro Wochentag, gültig ab Eintritt) und den Urlaubsanspruch eintragen.",
            "Die Person einem Team zuordnen, damit Teamleitung und Urlaubs-Überschneidungen stimmen.",
          ],
        },
      ],
    },
    {
      id: "mitglieder",
      title: "Mitglieder verwalten",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Mitglieder öffnen", href: "/admin/members" }],
        },
        {
          kind: "text",
          body: "Liste aller Mitglieder mit Suche sowie Filtern nach Rolle, Status und Team. Über das **„⋮“-Menü** pro Person: Profil ansehen, E-Mail kopieren, Upload-Anfragen erlauben/sperren.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Rolle ändern, Geschäftsführungs-Zugriff gewähren, erneut einladen sowie ein Konto sperren oder entfernen sind **Admin-only** — als Führungskraft siehst du diese Menüpunkte nicht.",
        },
      ],
    },
  ],
};

export function VerwaltungMitgliederGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
