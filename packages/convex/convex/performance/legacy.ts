/**
 * TRANSITION STUBS — delete after 10/2026.
 *
 * A push to main deploys Convex within seconds, the intranet on Vercel only
 * minutes later. In that gap the previous intranet build still calls the
 * old Performance password-login functions; when they were simply gone, the
 * intranet home page (which asks for the Performance session) crashed for
 * everyone (07.10.2026). These answer the old calls with "no Performance
 * session / no tenant", so an old build keeps working until the new one is
 * live. Nothing in the current code calls them.
 *
 * They are re-exported under their old paths from `performance/auth.ts` and
 * `performance/companies.ts`.
 */
import { v } from "convex/values";

import { mutation, query } from "../functions";

export const validateSession = query({
  args: { token: v.string() },
  handler: async () => ({ valid: false as const }),
});

export const createSessionForLinkedAccount = mutation({
  args: {},
  handler: async (): Promise<null> => null,
});

export const touchSession = mutation({
  args: { token: v.string() },
  handler: async () => ({ ok: true }),
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async () => ({ ok: true }),
});

export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (): Promise<null> => null,
});
