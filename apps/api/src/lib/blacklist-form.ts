/**
 * UTA-Black-List: das Google-Formular, über das Kunden/Interessenten gemeldet
 * werden, die nicht mehr kontaktiert werden möchten. Das Intranet füllt es im
 * Hintergrund aus (routes/blacklist.ts) – hier nur der reine Payload-Bau.
 */
export const BLACKLIST_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdBm28M8seqLWajlDgAngHNKuPtATLRg8xl91BXfgVEHKaUTQ/formResponse";

export const BLACKLIST_CHOICES = {
  delete_all:
    "Alle Daten löschen, Kunde ist informiert, dass es dann in Zukunft auch wieder zu einem Kontakt kommen kann",
  keep_name:
    "Kontaktnamen beibehalten und alle weiteren Daten löschen, um einen Kontakt in Zukunft 100%ig ausschließen zu können",
} as const;

export type BlacklistChoice = keyof typeof BLACKLIST_CHOICES;

export interface BlacklistInput {
  salesforceUrl: string;
  accountId?: string;
  contactName: string;
  choice: BlacklistChoice;
  note?: string;
}

/** Felder des Formulars (entry.*) als x-www-form-urlencoded-Body. */
export function buildBlacklistPayload(input: BlacklistInput, submittedBy: string): URLSearchParams {
  const note = input.note?.trim() ?? "";
  const footer = `Eingetragen über das Intranet von ${submittedBy.trim() || "unbekannt"}`;
  const params = new URLSearchParams();
  params.set("entry.439701450", input.salesforceUrl.trim());
  params.set("entry.313468504", input.accountId?.trim() ?? "");
  params.set("entry.912366685", input.contactName.trim());
  params.set("entry.174213086", BLACKLIST_CHOICES[input.choice]);
  params.set("entry.1679614355", note ? `${note}\n\n${footer}` : footer);
  return params;
}

/** Sieht wie eine http(s)-URL aus? Salesforce-Domain wird nicht erzwungen. */
export function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
