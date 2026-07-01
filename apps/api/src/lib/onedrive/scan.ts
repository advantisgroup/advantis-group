import { fileTypeFromBuffer } from "file-type";

import {
  type ScanFlag,
  type ScanReport,
  type ScanSeverity,
  type ScanVerdict,
} from "@advantis/types";

/**
 * In-house "is this file suspicious?" scanner. Deliberately heuristic and
 * dependency-light (no AV daemon) so it runs inline before a manager reviews an
 * upload. It is shaped behind the `Scanner` interface so a real engine
 * (ClamAV / VirusTotal) can be slotted in later without touching call sites.
 *
 * Severities map onto the verdict: any `danger` flag → "blocked" (refuse the
 * upload outright), any `warning` → "suspicious" (allowed, but surfaced
 * prominently to the approving manager), otherwise "clean".
 */

export interface ScanInput {
  bytes: Uint8Array;
  fileName: string;
  declaredMime: string;
}

export interface Scanner {
  scan(input: ScanInput): Promise<ScanReport>;
}

// Executable / script extensions that should never live in OneDrive.
const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "scr",
  "com",
  "pif",
  "bat",
  "cmd",
  "msi",
  "msp",
  "hta",
  "cpl",
  "js",
  "jse",
  "vbs",
  "vbe",
  "ws",
  "wsf",
  "wsh",
  "ps1",
  "ps1xml",
  "psm1",
  "jar",
  "reg",
  "scf",
  "lnk",
  "dll",
  "sys",
  "drv",
  "ocx",
  "gadget",
  "msc",
]);

// Macro-enabled Office documents — common malware delivery vector.
const MACRO_EXTENSIONS = new Set([
  "docm",
  "xlsm",
  "pptm",
  "dotm",
  "xltm",
  "potm",
  "xlam",
  "ppam",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "gz",
  "bz2",
  "tar",
  "iso",
  "cab",
]);

// Extensions that frequently precede a disguising second extension.
const DOC_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "rtf",
]);

const LARGE_FILE_BYTES = 100 * 1024 * 1024; // informational note above 100 MB

function extensions(name: string): string[] {
  return name
    .toLowerCase()
    .split(".")
    .slice(1)
    .map(e => e.trim())
    .filter(Boolean);
}

function severityRank(s: ScanSeverity): number {
  return s === "danger" ? 3 : s === "warning" ? 2 : 1;
}

function verdictFor(flags: ScanFlag[]): ScanVerdict {
  let max = 0;
  for (const f of flags) max = Math.max(max, severityRank(f.severity));
  if (max >= 3) return "blocked";
  if (max === 2) return "suspicious";
  return "clean";
}

/** Default heuristic scanner. */
export class HeuristicScanner implements Scanner {
  async scan({
    bytes,
    fileName,
    declaredMime,
  }: ScanInput): Promise<ScanReport> {
    const flags: ScanFlag[] = [];
    const exts = extensions(fileName);
    const finalExt = exts.at(-1) ?? "";

    if (bytes.byteLength === 0) {
      flags.push({
        code: "empty_file",
        severity: "info",
        detail: "The file is empty (0 bytes).",
      });
    }
    if (bytes.byteLength > LARGE_FILE_BYTES) {
      flags.push({
        code: "large_file",
        severity: "info",
        detail: `Large file (${Math.round(bytes.byteLength / (1024 * 1024))} MB).`,
      });
    }

    if (BLOCKED_EXTENSIONS.has(finalExt)) {
      flags.push({
        code: "blocked_extension",
        severity: "danger",
        detail: `Executable/script files (.${finalExt}) are not allowed.`,
      });
    }

    // Double extension like "invoice.pdf.exe" — a doc-looking name hiding an
    // executable, or any extra extension before a blocked one.
    if (exts.length >= 2) {
      const priorLooksDoc = exts.slice(0, -1).some(e => DOC_EXTENSIONS.has(e));
      if (priorLooksDoc && BLOCKED_EXTENSIONS.has(finalExt)) {
        flags.push({
          code: "double_extension",
          severity: "danger",
          detail: `Disguised double extension: "${fileName}".`,
        });
      }
    }

    if (MACRO_EXTENSIONS.has(finalExt)) {
      flags.push({
        code: "macro_document",
        severity: "warning",
        detail: `Macro-enabled document (.${finalExt}) — verify the source.`,
      });
    }

    if (ARCHIVE_EXTENSIONS.has(finalExt)) {
      flags.push({
        code: "archive",
        severity: "warning",
        detail: `Archive (.${finalExt}) — contents are not inspected.`,
      });
    }

    // Magic-byte check: does the real content match the claimed type?
    try {
      const detected = await fileTypeFromBuffer(bytes);
      if (detected) {
        const detectedExt = detected.ext.toLowerCase();
        if (
          BLOCKED_EXTENSIONS.has(detectedExt) &&
          !BLOCKED_EXTENSIONS.has(finalExt)
        ) {
          flags.push({
            code: "executable_content",
            severity: "danger",
            detail: `File content is actually an executable (${detectedExt}) despite its ".${finalExt}" name.`,
          });
        } else if (
          finalExt &&
          detectedExt !== finalExt &&
          !sameFamily(detectedExt, finalExt) &&
          !isContainerMismatch(detectedExt, finalExt)
        ) {
          flags.push({
            code: "extension_mismatch",
            severity: "warning",
            detail: `Content looks like ${detectedExt} but the file is named ".${finalExt}".`,
          });
        }
        if (
          declaredMime &&
          detected.mime &&
          !mimeMatches(declaredMime, detected.mime)
        ) {
          flags.push({
            code: "mime_mismatch",
            severity: "info",
            detail: `Declared "${declaredMime}", detected "${detected.mime}".`,
          });
        }
      }
    } catch {
      // file-type can't read every format (e.g. plain text); not a failure.
    }

    return { verdict: verdictFor(flags), flags, scannedAt: Date.now() };
  }
}

// Treat near-equivalent extensions as the same so we don't cry wolf.
const FAMILIES: string[][] = [
  ["jpg", "jpeg"],
  ["tif", "tiff"],
  ["htm", "html"],
  ["docx", "zip"], // OOXML is a zip container
  ["xlsx", "zip"],
  ["pptx", "zip"],
];

function sameFamily(a: string, b: string): boolean {
  return FAMILIES.some(fam => fam.includes(a) && fam.includes(b));
}

// Office/zip-container formats are detected as "zip" — don't flag those.
function isContainerMismatch(detected: string, declared: string): boolean {
  const containerBacked = new Set([
    "docx",
    "xlsx",
    "pptx",
    "odt",
    "ods",
    "odp",
    "epub",
    "jar",
  ]);
  return detected === "zip" && containerBacked.has(declared);
}

function mimeMatches(declared: string, detected: string): boolean {
  if (declared === detected) return true;
  // Compare the type halves loosely (image/*, etc.).
  return declared.split("/")[0] === detected.split("/")[0];
}

let scanner: Scanner = new HeuristicScanner();

/** Override the active scanner (e.g. inject a ClamAV/VirusTotal scanner). */
export function setScanner(next: Scanner): void {
  scanner = next;
}

export function scanFile(input: ScanInput): Promise<ScanReport> {
  return scanner.scan(input);
}
