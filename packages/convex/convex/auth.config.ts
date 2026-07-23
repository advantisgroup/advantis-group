import { type AuthConfig } from "convex/server";

// One Clerk instance (root domain advantisgroup.de) covers both the
// marketing site and the intranet (intern.advantisgroup.de, an allowed
// subdomain) — subdomain auth sharing is native to a single Clerk instance,
// no satellite domain needed. It must expose a "convex" JWT template that
// includes the user's primary email as an `email` claim (used by
// lib/auth.ensureUser).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
