import type { api } from "@advantis/convex/api";
import type { FunctionReturnType } from "convex/server";

export type ApplicantDetail = NonNullable<
  FunctionReturnType<typeof api.applicants.get>
>;

export const KONTAKT_ARTEN = [
  "telefon",
  "email",
  "persoenlich",
  "video",
  "sonstiges",
] as const;

export const EMAIL_KATEGORIEN = [
  "telefonisch_nicht_erreicht",
  "einladung",
  "absage",
  "sonstiges",
] as const;

export const TERMIN_ARTEN = ["telefon", "teams", "vor_ort"] as const;

export const TERMIN_TYPEN = [
  "interview",
  "gespraech",
  "probetag",
  "wiedervorlage",
  "sonstiges",
] as const;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
