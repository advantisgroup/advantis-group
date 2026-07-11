"use client";

import { useState } from "react";

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";

// Same bundler-integration recipe as the CV-viewer's PdfViewer — see that
// file's comment for why this must use react-pdf's re-exported `pdfjs`
// rather than importing `pdfjs-dist` directly.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;

/** Read-only PDF preview for the global file viewer — page navigation and
 * zoom only, no text-selection overlay (that's specific to the CV-extraction
 * fallback modal's `PdfViewer`). */
export function PdfPreview({ url }: { url: string }) {
  const t = useTranslations("Applicants");
  const [loadError, setLoadError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);

  if (loadError) {
    return (
      <p className="max-w-sm py-8 text-center text-sm text-white/70">
        {t("pdfLoadFailed")}
      </p>
    );
  }

  return (
    <div className="flex h-full max-w-full flex-col items-center gap-3">
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto">
        <Document
          file={url}
          loading={<Loader2 className="size-6 animate-spin text-white/70" />}
          onLoadSuccess={pdf => {
            setNumPages(pdf.numPages);
            setCurrentPage(1);
          }}
          onLoadError={() => setLoadError(true)}
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
            className="shadow-2xl"
            onLoadError={() => setLoadError(true)}
          />
        </Document>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-white">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("prevPage")}
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
          onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
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
          onClick={() =>
            setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
          }
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("zoomIn")}
          disabled={scale >= MAX_SCALE}
          onClick={() =>
            setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
          }
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  );
}
