import { type ApplicantDetail, EMAIL_KATEGORIEN } from "@/components/applicants/applicant-types";

export { EMAIL_KATEGORIEN };
export type EmailKategorie = (typeof EMAIL_KATEGORIEN)[number];

/** What a template may contain; shown as a hint in the template editor. */
export const PLACEHOLDERS = [
  "{Vorname}",
  "{Name}",
  "{Position}",
  "{Termin}",
  "{Uhrzeit}",
  "{Art}",
] as const;

type Termin = ApplicantDetail["termine"][number];

/** The next appointment that hasn't happened yet — what an invitation is
 *  about. Earliest first; today counts. */
export function nextOpenTermin(applicant: ApplicantDetail, today: string): Termin | null {
  const upcoming = applicant.termine
    .filter((termin) => !termin.uebernommen && termin.datum >= today)
    .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));
  return upcoming[0] ?? null;
}

function germanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/**
 * Fills the placeholders the send dialog knows. One with no value (no
 * appointment yet, no position) stays as it is, so it shows up before the
 * mail goes out instead of leaving a gap in the sentence.
 */
export function fillTemplate(
  text: string,
  applicant: ApplicantDetail,
  termin: Termin | null,
  artLabel: (art: Termin["art"]) => string,
): string {
  const vorname = applicant.name.trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    Vorname: vorname,
    Name: applicant.name.trim(),
    Position: applicant.position?.trim() ?? "",
    Termin: termin ? germanDate(termin.datum) : "",
    Uhrzeit: termin?.uhrzeit ?? "",
    Art: termin ? artLabel(termin.art) : "",
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] || match);
}

/** Placeholders still in a text — the send dialog won't send while any remain. */
export function openPlaceholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])];
}
