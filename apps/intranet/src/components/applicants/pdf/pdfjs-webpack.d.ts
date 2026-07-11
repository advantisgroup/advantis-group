/**
 * `pdfjs-dist/webpack.mjs` has no shipped type declarations (unlike the
 * package root and the legacy build) — its public API is identical to
 * `pdfjs-dist`'s (it does `export * from "./build/pdf.mjs"` plus configuring
 * the worker as a side effect), so re-export the root's types for it.
 */
declare module "pdfjs-dist/webpack.mjs" {
  export * from "pdfjs-dist";
}
