interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

/**
 * Whether this device/connection looks capable enough to eagerly prefetch
 * data the user hasn't asked for yet (e.g. nested folder listings one level
 * ahead of a hover). Conservative by design — anything ambiguous (API
 * unsupported, unknown) falls back to `true` for effectiveType/saveData since
 * most browsers exposing nothing here are Safari/Firefox on normal
 * connections, but stays strict on `deviceMemory` and any explicit signal.
 */
export function shouldEagerPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;

  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(connection.effectiveType)) {
    return false;
  }

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof deviceMemory === "number" && deviceMemory < 4) return false;

  return true;
}
