export interface BlogHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

// Matches combining diacritical marks left behind by NFKD decomposition
// (e.g. the accent split off "é") — Unicode property escape rather than a
// literal character range, so this stays plain ASCII source.
const DIACRITIC_RE = /\p{Diacritic}/gu;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITIC_RE, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEADING_RE = /<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g;

/**
 * Runs over already-sanitized post HTML (h2/h3 only — sanitize-html's
 * default allowlist covers those) and stamps a slug `id` onto each heading,
 * collecting the same list the TOC renders from. One pass, one source of
 * truth for the anchors and the nav — done as a second regex pass rather
 * than via sanitize-html's `transformTags` because that hook only sees the
 * opening tag, not the heading text needed to build the id.
 */
export function addHeadingIds(html: string): { html: string; headings: BlogHeading[] } {
  const headings: BlogHeading[] = [];
  const seen = new Map<string, number>();

  const withIds = html.replace(
    HEADING_RE,
    (match, levelStr: string, attrs: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (!text) return match;
      const level = Number(levelStr) as 2 | 3;
      const base = slugify(text) || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count > 0 ? `${base}-${count}` : base;
      headings.push({ id, text, level });
      return `<h${level} id="${id}"${attrs}>${inner}</h${level}>`;
    },
  );

  return { html: withIds, headings };
}
