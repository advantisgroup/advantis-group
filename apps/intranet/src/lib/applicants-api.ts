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

export type ExtractResult =
  | { kind: "created"; applicantId: Id<"applicants"> }
  | {
      kind: "duplicate";
      duplicate: DuplicateMatch;
      pendingStorageId: Id<"_storage">;
      extractedFields: ExtractedApplicantFields;
    };

export interface RescanResult {
  extractedFields: ExtractedApplicantFields;
  storageId: Id<"_storage">;
}

export function useApplicantsApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      /**
       * Uploads a CV PDF for AI extraction. Returns either a newly created
       * applicant, or a duplicate-conflict result (pass `forceCreate: true`
       * to create anyway once the caller has confirmed with the user).
       */
      extract: async (file: File, forceCreate = false): Promise<ExtractResult> => {
        const form = new FormData();
        form.append("file", file);
        if (forceCreate) form.append("forceCreate", "true");
        return api.uploadForm<ExtractResult>("/applicants/extract", form);
      },

      /**
       * Re-runs extraction against a CV for an existing applicant. Returns
       * the parsed fields plus a staged storageId — nothing is persisted
       * until the caller drives `applicants.update` + `applicants.addDocument`.
       */
      rescan: async (file: File): Promise<RescanResult> => {
        const form = new FormData();
        form.append("file", file);
        return api.uploadForm<RescanResult>("/applicants/rescan", form);
      },
    }),
    [api],
  );
}
