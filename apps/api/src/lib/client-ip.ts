/** How many proxies sit between the public internet and this process. One
 * (the edge that terminates TLS) unless something else is chained in front. */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));

/**
 * The caller's IP as our own edge observed it.
 *
 * `x-forwarded-for` is append-only: whatever the caller sends stays at the
 * front of the list, and each proxy appends the address it actually saw. So
 * reading `[0]` reads a value the caller chose — which is fine for logging
 * and useless for anything that has to be stable, like a rate-limit bucket or
 * a device fingerprint. Counting back from the right lands on the entry our
 * edge appended, which the caller cannot forge.
 */
export function clientIp(request: Request): string {
  const chain =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  if (chain.length === 0) return "unknown";
  return chain[Math.max(0, chain.length - TRUSTED_PROXY_HOPS)] ?? "unknown";
}
