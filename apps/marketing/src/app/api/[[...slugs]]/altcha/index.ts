import { Elysia } from "elysia";

import { altchaEnabled, newChallenge } from "@/lib/altcha";

/** A fresh puzzle for the forms' spam check, or `{ disabled: true }` where it's off. */
export const altcha = new Elysia().get("/altcha", async ({ set }) => {
  set.headers["cache-control"] = "no-store";
  if (!altchaEnabled) return { disabled: true as const };
  return await newChallenge();
});
