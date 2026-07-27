"use client";

import { useState } from "react";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs, type TextItem } from "react-pdf";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type PdfTextContent, PdfTextLayer } from "./PdfTextLayer";

/**
 * react-pdf's own bundler-integration recipe (its docs' Next.js example):
 * construct the worker via `new URL(...)` at module scope so bundlers can
 * recognize and bundle it as an asset. Using react-pdf's re-exported
 * `pdfjs` (rather than importing `pdfjs-dist` directly) guarantees the
 * worker matches the exact pdfjs-dist version react-pdf's components use
 * internally — a version mismatch between the two is a common source of
 * pdf.js failing silently or hanging.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;

const MIN_TEXT_LENGTH = 3;

/** Stable reference (module scope, not per-render) so PdfTextLayer's
 * useMemo of the text-item geometry doesn't recompute on every render. */
const pdfUtil = {
  transform: (m1: number[], m2: number[]) => pdfjs.Util.transform(m1, m2) as number[],
};

interface Viewport {
  width: number;
  height: number;
  transform: number[];
}

export function PdfViewer({
  file,
  onTextSelected,
  onPageHasNoText,
}: {
  file: File;
  onTextSelected: (text: string) => void;
  onPageHasNoText: (hasNoText: boolean) => void;
}) {
  const t = useTranslations("Applicants");
  const handleError = useErrorHandler();

  const [loadError, setLoadError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [textContent, setTextContent] = useState<PdfTextContent | null>(null);

  async function handlePageRenderSuccess(page: {
    getViewport: (params: { scale: number }) => Viewport;
    getTextContent: () => Promise<{ items: (TextItem | { type: string })[] }>;
  }) {
    try {
      const vp = page.getViewport({ scale });
      const raw = await page.getTextContent();
      const items = raw.items.filter((item): item is TextItem => "str" in item);
      const joinedLength = items.reduce((sum, i) => sum + i.str.trim().length, 0);
      onPageHasNoText(joinedLength < MIN_TEXT_LENGTH);
      setViewport(vp);
      setTextContent({ items });
    } catch (e) {
      console.error("[PdfViewer] page render success handler failed:", e);
      setLoadError(true);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("prevPage")}
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-24 text-center text-xs text-muted-foreground">
            {t("pageIndicator", { current: currentPage, total: numPages || 1 })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("nextPage")}
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomOut")}
            disabled={scale <= MIN_SCALE}
            onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomIn")}
            disabled={scale >= MAX_SCALE}
            onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
        {loadError ? (
          <p className="max-w-sm py-8 text-center text-sm text-muted-foreground">
            {t("pdfLoadFailed")}
          </p>
        ) : (
          <Document
            file={file}
            loading={null}
            onLoadSuccess={(pdf) => {
              setNumPages(pdf.numPages);
              setCurrentPage(1);
            }}
            onLoadError={(e) => {
              console.error("[PdfViewer] Document onLoadError:", e);
              setLoadError(true);
              handleError(e, t("pdfLoadFailed"));
            }}
          >
            <div
              className="relative shadow-md"
              style={{ width: viewport?.width, height: viewport?.height }}
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={null}
                onRenderSuccess={(page) => void handlePageRenderSuccess(page)}
                onLoadError={(e) => {
                  console.error("[PdfViewer] Page onLoadError:", e);
                  setLoadError(true);
                }}
              />
              {viewport && textContent && (
                <PdfTextLayer
                  textContent={textContent}
                  viewport={viewport}
                  util={pdfUtil}
                  onTextSelected={onTextSelected}
                />
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
