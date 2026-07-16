// Client-side helpers for the Performance feature's session token. This is a
// temporary, non-Clerk auth bridge (see `performanceAuth.ts`); the token is
// bearer-style and admin-revocable, so a non-httpOnly cookie is acceptable
// here, same as the guest tour token (`lib/guest.ts`).
const COOKIE = "performance_token";

export function getPerformanceToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find(row => row.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function setPerformanceToken(token: string, expiresAt: number): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  document.cookie = `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearPerformanceToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}
