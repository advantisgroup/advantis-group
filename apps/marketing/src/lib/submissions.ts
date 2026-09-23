import { api } from "@advantis/convex/api";

import { convex } from "./convex-server";

/**
 * Whether the contact forms are open, for the API routes. Toggled from the
 * intranet admin panel ("Website contact forms"), so no redeploy needed.
 */
export async function submissionsOpen(): Promise<boolean> {
  // until the flag has been set once, the old env var still decides
  const fallback = process.env.NEXT_PUBLIC_ALLOW_SUBMISSIONS === "true";
  if (!convex) return fallback;
  try {
    return (await convex.query(api.marketing.forms.submissionsOpen, {})) ?? fallback;
  } catch (error) {
    console.error("[submissions] couldn't read the flag, using the env default:", error);
    return fallback;
  }
}
