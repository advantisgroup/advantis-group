/**
 * pdf.js only works in the browser (it touches canvas/DOMMatrix/Path2D APIs
 * that don't exist under Next.js's Node SSR runtime), so the module is
 * dynamically imported inside `loadPdf()` rather than statically at the top
 * of this file — this file itself must only ever be imported from client
 * components, but the dynamic import is a second guard against accidental
 * server evaluation.
 */

import type * as PdfJs from "pdfjs-dist";

export type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";

/**
 * `TextContent`/`TextItem` aren't re-exported from pdf.js's public root
 * module (only reachable via its internal `display/api` path), so these
 * mirror the shape of `PDFPageProxy.getTextContent()`'s result directly
 * rather than depending on an internal import path that could move.
 */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PdfTextContent {
  items: PdfTextItem[];
}

let workerConfigured = false;

export async function loadPdf(file: File): Promise<PdfJs.PDFDocumentProxy> {
  const pdfjsLib = await import("pdfjs-dist");

  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    workerConfigured = true;
  }

  const data = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data }).promise;
}

export async function getUtil(): Promise<typeof PdfJs.Util> {
  const pdfjsLib = await import("pdfjs-dist");
  return pdfjsLib.Util;
}
