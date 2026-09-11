"use client";

import { useMemo } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { useIntranetApiClient } from "@/lib/api-client";

export interface ExtractedApplicantFields {
  name: string;
  email: string;
  telefon: string;
  adresse: string;
  geburtsdatum: string;
  position: string;
  skills: string[];
  ausbildung: string;
  berufserfahrung: string;
  zusammenfassung: string;
}

export interface DuplicateMatch {
  applicantId: Id<"applicants">;
  name: string;
  matchedOn: "email" | "telefon";
}

/** What a finished `cvExtract` run holds (see apps/api routes/applicants.ts). */
export type CvExtractOutput =
  | { kind: "created"; applicantId: Id<"applicants">; name: string; fileName: string }
  | {
      kind: "duplicate";
      duplicate: DuplicateMatch;
      pendingStorageId: Id<"_storage">;
      extractedFields: ExtractedApplicantFields;
      fileName: string;
    };

/** What a finished `cvRescan` run holds — nothing is persisted until the
 *  caller drives `applicants.update` + `applicants.addDocument` itself. */
export interface CvRescanOutput {
  extractedFields: ExtractedApplicantFields;
  storageId: Id<"_storage">;
  fileName: string;
}

export function useApplicantsApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      /** Starts reading one CV. The run creates the applicant itself, or
       *  reports a duplicate for someone to decide on — see CvImportTray. */
      startExtract: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return api.uploadForm<{ runId: string }>("/applicants/extract", form);
      },

      /** "Not the same person" for a duplicate: creates the applicant from
       *  what the run already read, without reading the PDF again. */
      createAnyway: (runId: string) =>
        api.fetchJson<{ applicantId: Id<"applicants"> }>(`/applicants/extract/${runId}/create`, {
          method: "POST",
        }),

      /** Starts re-reading a CV for an existing applicant. */
      startRescan: (file: File, applicantId: Id<"applicants">) => {
        const form = new FormData();
        form.append("file", file);
        form.append("applicantId", applicantId);
        return api.uploadForm<{ runId: string }>("/applicants/rescan", form);
      },
    }),
    [api],
  );
}
