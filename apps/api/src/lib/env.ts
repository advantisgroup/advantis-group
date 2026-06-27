/** Read an env var or throw a clear error at call time. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const PORT = Number(process.env.PORT ?? 3002);

/** Origins allowed by CORS. Extend via CORS_ORIGINS (comma-separated). */
export const allowedOrigins = [
  process.env.INTRANET_URL ?? "https://intranet.advantisgroup.de",
  process.env.SITE_URL ?? "https://advantisgroup.de",
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.CORS_ORIGINS?.split(",").map(o => o.trim()) ?? []),
].filter(Boolean);

export const allowedOriginSuffixes = [".advantisgroup.de", ".vercel.app"];

export function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    return allowedOriginSuffixes.some(s => hostname.endsWith(s));
  } catch {
    return false;
  }
}
