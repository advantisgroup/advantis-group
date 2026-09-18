import { escapeHtml } from "@/lib/utils";

export interface ExportableBlogPost {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  authorName: string;
  language: string;
  publishedAt?: number;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Lazy-loaded the same way `wiki-import.ts` pulls in mammoth/dompurify -
 * neither library is needed until someone actually clicks "Download". */
export async function exportBlogPostAsMarkdown(post: ExportableBlogPost) {
  const [{ default: DOMPurify }, { default: TurndownService }] = await Promise.all([
    import("dompurify"),
    import("turndown"),
  ]);
  const sanitized = DOMPurify.sanitize(post.body);
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const markdownBody = turndown.turndown(sanitized);

  const frontmatter = [
    "---",
    `title: ${yamlString(post.title)}`,
    `slug: ${yamlString(post.slug)}`,
    `language: ${yamlString(post.language)}`,
    `author: ${yamlString(post.authorName)}`,
    post.publishedAt ? `date: ${new Date(post.publishedAt).toISOString()}` : null,
    `excerpt: ${yamlString(post.excerpt)}`,
    "---",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  downloadBlob(`${frontmatter}\n\n${markdownBody}\n`, `${post.slug || "post"}.md`, "text/markdown");
}

export async function exportBlogPostAsHtml(post: ExportableBlogPost) {
  const { default: DOMPurify } = await import("dompurify");
  const sanitized = DOMPurify.sanitize(post.body);
  const html = `<!doctype html>
<html lang="${post.language}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(post.title)}</title>
<meta name="description" content="${escapeHtml(post.excerpt)}" />
</head>
<body>
<h1>${escapeHtml(post.title)}</h1>
${sanitized}
</body>
</html>
`;
  downloadBlob(html, `${post.slug || "post"}.html`, "text/html");
}
