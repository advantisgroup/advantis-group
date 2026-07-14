import type { BundledLanguage } from "shiki";

const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
  "heic",
  "heif",
]);

const TEXT_EXTENSIONS = new Set(["txt", "log", "env", "csv", "cfg"]);

const CODE_LANG_BY_EXTENSION: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  graphql: "graphql",
  toml: "toml",
  ini: "ini",
  diff: "diff",
  vue: "vue",
  svelte: "svelte",
};

export type FileKind =
  | { kind: "image" }
  | { kind: "code"; lang: BundledLanguage }
  | { kind: "text" }
  | { kind: "archive" }
  | { kind: "unknown" };

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function detectFileKind(name: string, contentType?: string): FileKind {
  const ext = getExtension(name);
  if (ARCHIVE_EXTENSIONS.has(ext)) return { kind: "archive" };
  if (contentType?.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    return { kind: "image" };
  }
  const lang = CODE_LANG_BY_EXTENSION[ext];
  if (lang) return { kind: "code", lang };
  if (contentType?.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    return { kind: "text" };
  }
  return { kind: "unknown" };
}
