import { useEffect, useState } from "react";

/**
 * Where to send someone once they're signed in: the page they were on, as
 * carried in Clerk's `redirect_url` query parameter. Anything that points
 * off this site (or back at a sign-in page) falls back to the overview, so a
 * crafted link can't bounce someone elsewhere after they sign in.
 */
export function returnPath(redirectUrl: string | null | undefined, origin: string): string {
  if (!redirectUrl) return "/";
  try {
    const url = new URL(redirectUrl, origin);
    if (url.origin !== origin || /^\/sign-(in|up)(\/|$)/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

/** The current page's `redirect_url`, resolved with `returnPath`. */
export function returnPathFromLocation(): string {
  return returnPath(
    new URLSearchParams(window.location.search).get("redirect_url"),
    window.location.origin,
  );
}

/** `path` with the current page's `redirect_url` kept on it, for links
 *  between the sign-in screens. Filled in after mount, since the server
 *  render has no query string to read. */
export function useKeepReturnTo(path: string): string {
  const [href, setHref] = useState(path);
  useEffect(() => {
    const redirectUrl = new URLSearchParams(window.location.search).get("redirect_url");
    if (redirectUrl) setHref(`${path}?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }, [path]);
  return href;
}
