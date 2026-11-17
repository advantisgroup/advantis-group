"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";

// Same bundler-integration recipe as the CV-viewer's PdfViewer — see that
// file's comment for why this must use react-pdf's re-exported `pdfjs`
// rather than importing `pdfjs-dist` directly.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
/** Fit-to-width never goes wider than this, so a portrait page still reads
 *  like a page on a big monitor. */
const MAX_FIT_WIDTH = 1100;
/** Canvas pixels per side — beyond this browsers run out of canvas memory. */
const MAX_CANVAS_PX = 5000;

/** Read-only PDF preview for the global file viewer — page navigation and
 * zoom only, no text-selection overlay (that's specific to the CV-extraction
 * fallback modal's `PdfViewer`). */
export function PdfPreview({ url }: { url: string }) {
  const t = useTranslations("Applicants");
  // Tracked as "which url failed" rather than a boolean, so a new url clears
  // the error on its own — a latched boolean kept showing the failure after
  // a retry had already produced a working url.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const loadError = failedUrl === url;
  // The page used to render at its PDF size (≈ 600 px for A4) on a 1×
  // canvas — dense price lists turned into mush. Now it fills the viewer's
  // width and renders at least at 2× pixel density, so small print and
  // zooming in stay sharp.
  const scroller = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setFitWidth(Math.min(el.clientWidth - 16, MAX_FIT_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pageWidth = Math.max(200, Math.round((fitWidth || 600) * scale));
  const pixelRatio = Math.min(
    Math.max(typeof window === "undefined" ? 1 : window.devicePixelRatio, 2),
    MAX_CANVAS_PX / pageWidth,
  );

  if (loadError) {
    return <p className="max-w-sm py-8 text-center text-sm text-white/70">{t("pdfLoadFailed")}</p>;
  }

  return (
    <div className="flex h-full w-full max-w-full flex-col items-center gap-3">
      {/* Block + mx-auto rather than flex-centring, so a zoomed-in page can
          still be scrolled to its left edge. */}
      <div ref={scroller} className="min-h-0 w-full flex-1 overflow-auto">
        <Document
          className="mx-auto w-max"
          file={url}
          loading={<Loader2 className="size-6 animate-spin text-white/70" />}
          onLoadSuccess={(pdf) => {
            setNumPages(pdf.numPages);
            setCurrentPage(1);
          }}
          onLoadError={() => setFailedUrl(url)}
        >
          <Page
            pageNumber={currentPage}
            width={pageWidth}
            devicePixelRatio={pixelRatio}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
            className="shadow-2xl"
            onLoadError={() => setFailedUrl(url)}
          />
        </Document>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-white">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("prevPage")}
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-24 text-center text-xs text-white/80">
          {t("pageIndicator", { current: currentPage, total: numPages || 1 })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("nextPage")}
          disabled={currentPage >= numPages}
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("zoomOut")}
          disabled={scale <= MIN_SCALE}
          onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("zoomIn")}
          disabled={scale >= MAX_SCALE}
          onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  );
}
