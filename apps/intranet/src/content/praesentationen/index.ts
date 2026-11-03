/**
 * Präsentationen im Wiki – nur für Admins (Knopf auf der Wiki-Startseite,
 * Seite /praesentationen/<slug>). Neue Präsentation: HTML als String-Modul
 * in diesem Ordner ablegen und hier eintragen. Nicht nach public/ legen –
 * dort wäre sie ohne Anmeldung erreichbar. Das HTML wird erst auf der Seite
 * nachgeladen, nicht schon mit der Wiki-Übersicht. Stand 03.11.2026 (Vahan).
 */
export type Praesentation = {
  slug: string;
  title: string;
  subtitle: string;
  load: () => Promise<string>;
};

export const PRAESENTATIONEN: readonly Praesentation[] = [
  {
    slug: "currenta-abs",
    title: "CURRENTA · Account Based Selling Analytik",
    subtitle: "Vertriebsqualifizierung, 11 Wochen (Jörg)",
    load: () => import("./currenta-abs").then((m) => m.CURRENTA_ABS_HTML),
  },
];

export function findPraesentation(slug: string): Praesentation | undefined {
  return PRAESENTATIONEN.find((p) => p.slug === slug);
}
