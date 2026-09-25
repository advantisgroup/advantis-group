"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

const ENV_DEFAULT = process.env.NEXT_PUBLIC_ALLOW_SUBMISSIONS === "true";

/**
 * Live view of the "Website contact forms" flag — flipping it in the intranet
 * opens or closes the forms on pages that are already open. `undefined` while
 * it loads, so the page shows neither the closed banner nor a live send button
 * until it knows; before anyone has set the flag, the env var decides.
 */
export function useSubmissionsOpen(): boolean | undefined {
  const open = useQuery(api.marketing.forms.submissionsOpen);
  if (open === undefined) return undefined;
  return open ?? ENV_DEFAULT;
}
