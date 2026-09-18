/**
 * Client-side extraction for the "import a document" wiki-entry flow —
 * turns a .docx/.pdf/.txt/.md file into HTML the rich text editor can load
 * directly, deterministically (no AI involved in this step; see
 * `wiki-import-api.ts` for the separate, opt-in "improve with AI" metadata
 * pass). Runs entirely in the browser: mammoth (docx) and pdf.js (pdf) are
 * already client-side dependencies here (the file viewer's DocxPreview /
 * PdfPreview use the same libraries), so there's no need to round-trip the
 * file through a server for the deterministic part.
 */

import { MAX_ATTACHMENT_BYTES } from "@/lib/upload";
import { escapeHtml } from "@/lib/utils";

export type ImportExt = "docx" | "pdf" | "txt" | "md";

export const SUPPORTED_IMPORT_EXTENSIONS: ImportExt[] = ["docx", "pdf", "txt", "md"];
export const IMPORT_FILE_ACCEPT = SUPPORTED_IMPORT_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Matches `MAX_ATTACHMENT_BYTES` deliberately — the source file is staged
 *  into the same attachment pipeline right after a successful import (see
 *  `WikiEntryComposer`), which enforces that cap independently. Anything
 *  bigger would pass this check but then silently fail to attach. */
export const MAX_IMPORT_BYTES = MAX_ATTACHMENT_BYTES;

export type WikiImportErrorCode =
  | "unsupported-type"
  | "too-large"
  | "no-text-layer"
  | "extract-failed";

export class WikiImportError extends Error {
  code: WikiImportErrorCode;
  constructor(code: WikiImportErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface ImportResult {
  ext: ImportExt;
  html: string;
  /** Best-effort title guess (first heading, else the filename) — always
   *  just a starting point, never presented as final. */
  thema: string;
  /** True if the source had at least one image — those are dropped rather
   *  than inlined as base64 (bloats the stored document; images belong in
   *  the attachment pipeline, not embedded in rich text), so the caller
   *  should tell the user why a picture they had is missing. */
  hadImages: boolean;
}

const EXT_BY_MIME: Partial<Record<string, ImportExt>> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function detectImportExt(file: File): ImportExt | null {
  const name = file.name.toLowerCase();
  for (const ext of SUPPORTED_IMPORT_EXTENSIONS) {
    if (name.endsWith(`.${ext}`)) return ext;
  }
  if (name.endsWith(".markdown")) return "md";
  return EXT_BY_MIME[file.type] ?? null;
}

/** Best-effort thema guess: the first heading's text, else the filename
 *  with its extension and separators cleaned up. Always overridable by the
 *  user — this just saves typing the obvious case. */
function guessThema(html: string, fileName: string): string {
  const heading = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("h1, h2, h3")
    ?.textContent?.trim();
  if (heading) return heading;
  return fileName
    .replace(/\.[^./]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** Drops <img> (see `ImportResult.hadImages`) and caps heading depth at h3 —
 *  the only levels the sanitizer/TOC understand (see rich-text.tsx and
 *  GuidebookToc); anything deeper becomes an h3 rather than losing its
 *  "this is a heading" structure entirely. */
function postProcessExtractedHtml(html: string): { html: string; hadImages: boolean } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let hadImages = false;
  doc.querySelectorAll("img").forEach((img) => {
    hadImages = true;
    img.remove();
  });
  doc.querySelectorAll("h4, h5, h6").forEach((h) => {
    const h3 = doc.createElement("h3");
    h3.innerHTML = h.innerHTML;
    h.replaceWith(h3);
  });
  return { html: doc.body.innerHTML, hadImages };
}

async function extractDocx(file: File): Promise<{ html: string; hadImages: boolean }> {
  const [mammoth, { default: DOMPurify }] = await Promise.all([
    import("mammoth"),
    import("dompurify"),
  ]);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const { html, hadImages } = postProcessExtractedHtml(result.value);
  // Mammoth doesn't sanitize its own output (same caveat DocxPreview already
  // documents) — a crafted .docx could carry a `javascript:` link.
  return { html: DOMPurify.sanitize(html), hadImages };
}

let pdfWorkerConfigured = false;

async function extractPdfText(file: File): Promise<{ html: string; hasText: boolean }> {
  const { pdfjs } = await import("react-pdf");
  if (!pdfWorkerConfigured) {
    // Same recipe as PdfPreview / the CV-extraction viewer — must use
    // react-pdf's re-exported `pdfjs`, not a separate `pdfjs-dist` import.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerConfigured = true;
  }
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const paragraphs: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) paragraphs.push(text);
  }
  // Plain text extraction has no layout/table information to work with —
  // every page becomes a flat run of paragraphs, unlike docx's real
  // structure. A scanned/image-only PDF has no text layer at all.
  const hasText = paragraphs.length > 0;
  const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return { html, hasText };
}

async function extractPlainText(file: File): Promise<{ html: string }> {
  const text = await file.text();
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const html = (paragraphs.length > 0 ? paragraphs : [text.trim()])
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
  return { html };
}

/** Extracts a document into rich-text-editor-ready HTML. Deterministic —
 *  no model call, no network request. Throws `WikiImportError` for anything
 *  the caller should show a specific message for (unsupported type, too
 *  large, no extractable text). */
export async function importFile(file: File): Promise<ImportResult> {
  const ext = detectImportExt(file);
  if (!ext) throw new WikiImportError("unsupported-type");
  if (file.size > MAX_IMPORT_BYTES) throw new WikiImportError("too-large");

  try {
    if (ext === "docx") {
      const { html, hadImages } = await extractDocx(file);
      return { ext, html, thema: guessThema(html, file.name), hadImages };
    }
    if (ext === "pdf") {
      const { html, hasText } = await extractPdfText(file);
      if (!hasText) throw new WikiImportError("no-text-layer");
      return { ext, html, thema: guessThema(html, file.name), hadImages: false };
    }
    const { html } = await extractPlainText(file);
    return { ext, html, thema: guessThema(html, file.name), hadImages: false };
  } catch (e) {
    if (e instanceof WikiImportError) throw e;
    throw new WikiImportError("extract-failed");
  }
}
