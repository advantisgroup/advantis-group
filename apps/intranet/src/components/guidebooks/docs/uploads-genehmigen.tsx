import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Uploads_Genehmigen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Manager+ only (see registry.ts minRole) — no screenshots needed for now.
 */
const IMG = "/guidebooks/uploads-genehmigen";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Uploads_Genehmigen.docx`,
    fileName: "Uploads_Genehmigen.docx",
  },
  sections: [
    {
      id: "ausstehende-uploads",
      title: "Ausstehende Uploads prüfen",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Uploads öffnen", href: "/admin/uploads" }],
        },
        {
          kind: "text",
          body: "Im Bereich **„Ausstehende Freigaben“** zeigt jede Anfrage Größe, Typ, Anfragezeitpunkt und Zielordner der Datei sowie das Ergebnis der Sicherheitsprüfung („Unbedenklich“, falls sauber).",
        },
        {
          kind: "text",
          body: "Optional eine Notiz an die anfragende Person hinterlassen, dann **„Ablehnen“** oder **„Genehmigen“** klicken.",
        },
      ],
    },
    {
      id: "audit",
      title: "OneDrive-Aktivität",
      blocks: [
        {
          kind: "text",
          body: "Direkt darunter zeigt **„OneDrive-Aktivität“** den Prüfpfad: wer wann welchen Upload genehmigt, abgelehnt oder eine Berechtigung geändert hat — neueste Einträge zuerst.",
        },
      ],
    },
    {
      id: "berechtigung",
      title: "Upload-Berechtigung einzelner Personen steuern",
      blocks: [
        {
          kind: "links",
          items: [{ label: "Mitglieder öffnen", href: "/admin/members" }],
        },
        {
          kind: "text",
          body: "Standardmäßig dürfen alle Mitarbeitenden Uploads anfragen. Über das **„⋮“-Menü** einer Person könnt ihr **„Upload-Anfragen sperren“** bzw. **„Upload-Anfragen erlauben“** auswählen, um das gezielt für einzelne Personen abzuschalten oder wieder freizugeben.",
        },
      ],
    },
  ],
};

export function UploadsGenehmigenGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
