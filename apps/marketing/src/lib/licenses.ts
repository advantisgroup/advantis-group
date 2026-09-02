/**
 * Icon sources for the licence directory.
 *
 * 400 of the 407 packages live on GitHub across 103 owners, so the owner's
 * avatar is a real brand mark for almost every entry — Babel's logo for
 * `@babel/*`, Radix's for `@radix-ui/*` — and the browser caches one request
 * per owner rather than per package.
 *
 * NOTE: this makes the licences page issue image requests to github.com (and,
 * inside the details dialog, to the publisher's own domain for its favicon).
 * Set `USE_REMOTE_PACKAGE_ICONS` to false to fall back to local glyphs
 * everywhere if those third-party requests are unwanted.
 */
export const USE_REMOTE_PACKAGE_ICONS = true;

const GITHUB_HOST = "github.com";

function safeUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** `https://github.com/babel/babel` -> `babel`. */
export function gitHubOwner(repository: string | undefined): string | null {
  const url = safeUrl(repository);
  if (!url || !url.hostname.endsWith(GITHUB_HOST)) return null;

  const [owner] = url.pathname.replace(/^\/+/, "").split("/");
  return owner || null;
}

/**
 * The owner's avatar. Addressed on the avatar host directly rather than via
 * `github.com/<owner>.png`, which only 302s here anyway — one hop fewer, and
 * it keeps the image requests off the main GitHub domain. An owner with no
 * avatar still resolves, to a generated identicon, so this rarely falls back.
 */
export function packageIconUrl(repository: string | undefined): string | null {
  if (!USE_REMOTE_PACKAGE_ICONS) return null;

  const owner = gitHubOwner(repository);
  return owner ? `https://avatars.githubusercontent.com/${owner}?s=80` : null;
}

/** A site's own favicon — not a third-party favicon aggregator. */
export function faviconUrl(homepage: string | undefined): string | null {
  if (!USE_REMOTE_PACKAGE_ICONS) return null;

  const url = safeUrl(homepage);
  return url ? `${url.protocol}//${url.host}/favicon.ico` : null;
}

/** "GitHub" rather than "Repository" when we know where it is. */
export function repositoryHostLabel(repository: string | undefined): string | null {
  const url = safeUrl(repository);
  if (!url) return null;
  if (url.hostname.endsWith(GITHUB_HOST)) return "GitHub";
  if (url.hostname.endsWith("gitlab.com")) return "GitLab";
  if (url.hostname.endsWith("bitbucket.org")) return "Bitbucket";
  return url.hostname.replace(/^www\./, "");
}
