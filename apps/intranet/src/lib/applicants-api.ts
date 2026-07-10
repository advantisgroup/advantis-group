"use client";

import { useCallback, useMemo } from "react";

import { useAuth } from "@clerk/nextjs";

/**
 * Typed client for the Applicant Management PDF-extraction endpoint on the
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

export function useApplicantsApi() {
  const { getToken } = useAuth();

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  return useMemo(
    () => ({
      /** Uploads a CV PDF for AI extraction; returns the new applicant's id. */
      extract: async (file: File): Promise<{ applicantId: string }> => {
        const form = new FormData();
        form.append("file", file);
        return parse(
          await fetch(`${API}/applicants/extract`, {
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
