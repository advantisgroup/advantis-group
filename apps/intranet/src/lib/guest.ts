// Client-side helpers for the low-privilege guest tour token. The token is a
// bearer secret for read-only, guest-visible content only; it auto-expires and
// is admin-revocable, so a non-httpOnly cookie is acceptable here.
const COOKIE = "guest_token";

export function getGuestToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function setGuestToken(token: string, expiresAt: number): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  document.cookie = `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearGuestToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}
