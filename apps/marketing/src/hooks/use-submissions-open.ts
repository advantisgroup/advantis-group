"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

const ENV_DEFAULT = process.env.NEXT_PUBLIC_ALLOW_SUBMISSIONS === "true";

/**
 * Live view of the "Website contact forms" flag — flipping it in the intranet
 * opens or closes the forms on pages that are already open. While it loads, or
 * before anyone has set it, the env var decides.
 */
export function useSubmissionsOpen(): boolean {
  return useQuery(api.marketing.forms.submissionsOpen) ?? ENV_DEFAULT;
}
