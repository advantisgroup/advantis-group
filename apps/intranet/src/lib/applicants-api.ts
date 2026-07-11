"use client";

import { useCallback, useMemo } from "react";

import { type Id } from "@advantis/convex/dataModel";
import { useAuth } from "@clerk/nextjs";

/**
 * Typed client for the Applicant Management PDF-extraction endpoints on the
 * Advantis API. Cross-origin requests can't rely on the Clerk cookie, so the
 * call carries the session token as a Bearer header (same approach as
 * `useOneDriveApi`).
 */

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = "Something went wrong";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

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
  const { getToken } = useAuth();

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  return useMemo(
    () => ({
      /**
       * Uploads a CV PDF for AI extraction. Returns either a newly created
       * applicant, or a duplicate-conflict result (pass `forceCreate: true`
       * to create anyway once the caller has confirmed with the user).
       */
      extract: async (
        file: File,
        forceCreate = false
      ): Promise<ExtractResult> => {
        const form = new FormData();
        form.append("file", file);
        if (forceCreate) form.append("forceCreate", "true");
        return parse(
          await fetch(`${API}/applicants/extract`, {
            method: "POST",
            headers: await authHeaders(),
            body: form,
          })
        );
      },

      /**
       * Re-runs extraction against a CV for an existing applicant. Returns
       * the parsed fields plus a staged storageId — nothing is persisted
       * until the caller drives `applicants.update` + `applicants.addDocument`.
       */
      rescan: async (file: File): Promise<RescanResult> => {
        const form = new FormData();
        form.append("file", file);
        return parse(
          await fetch(`${API}/applicants/rescan`, {
            method: "POST",
            headers: await authHeaders(),
            body: form,
          })
        );
      },
    }),
    [authHeaders]
  );
}
