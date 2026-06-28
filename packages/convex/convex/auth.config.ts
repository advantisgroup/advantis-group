import { type AuthConfig } from "convex/server";

// The shared Convex deployment validates JWTs from BOTH Clerk instances:
//  - the marketing site (advantisgroup.de)
//  - the intranet (intern.advantisgroup.de)
// Each Clerk instance must expose a "convex" JWT template that includes the
// user's primary email as an `email` claim (used by lib/auth.ensureUser).
const issuerDomains = [
  process.env.CLERK_JWT_ISSUER_DOMAIN,
  process.env.INTERNAL_CLERK_JWT_ISSUER_DOMAIN,
].filter((domain): domain is string => Boolean(domain));

export default {
  providers: issuerDomains.map(domain => ({
    domain,
    applicationID: "convex",
  })),
} satisfies AuthConfig;
