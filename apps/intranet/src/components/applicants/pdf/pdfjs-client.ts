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
 * `pdfjs-dist/webpack.mjs` is pdf.js's own bundler-integration entry point:
 * importing it (instead of the plain `pdfjs-dist` root, or manually setting
 * `GlobalWorkerOptions.workerSrc` to a URL string) constructs a real
 * `new Worker(new URL(...), { type: "module" })` at a static call site the
 * bundler can recognize, as its side effect. Manually assigning a URL
 * *string* to `workerSrc` instead left pdf.js to construct the worker
 * itself, which is the documented cause of "Class constructor cannot be
 * invoked without 'new'" crashes under Next.js's production bundler.
 */

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

async function loadPdfjsLib() {
  console.warn("[pdfjs-client] importing pdfjs-dist/webpack.mjs ...");
  const pdfjsLib = (await import("pdfjs-dist/webpack.mjs")) as typeof PdfJs;
  console.warn("[pdfjs-client] import resolved", {
    hasGetDocument: typeof pdfjsLib.getDocument,
    hasWorkerPort: typeof pdfjsLib.GlobalWorkerOptions.workerPort,
    hasUtil: typeof pdfjsLib.Util,
  });
  return pdfjsLib;
}

export async function loadPdf(file: File): Promise<PdfJs.PDFDocumentProxy> {
  const pdfjsLib = await loadPdfjsLib();
  const data = await file.arrayBuffer();
  console.warn(
    "[pdfjs-client] calling getDocument(), byteLength =",
    data.byteLength
  );
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.warn(
    "[pdfjs-client] getDocument() resolved, numPages =",
    doc.numPages
  );
  return doc;
}

/**
 * Returns a plain object wrapping `Util.transform` rather than the `Util`
 * class itself. `Util` is a class, so `typeof Util === "function"` — handing
 * the class straight to a `useState` setter makes React treat it as a lazy
 * updater callback and try to invoke it, throwing "Class constructor Util
 * cannot be invoked without 'new'". `Util.transform` doesn't use `this`, so
 * this is a safe, equivalent extraction.
 */
export async function getUtil(): Promise<{
  transform(m1: number[], m2: number[]): number[];
}> {
  const pdfjsLib = await loadPdfjsLib();
  const { Util } = pdfjsLib;
  return {
    transform: (m1, m2) => Util.transform(m1, m2) as number[],
  };
}
