"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import {
  getUtil,
  loadPdf,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
  type PdfTextContent,
  type PdfTextItem,
} from "./pdfjs-client";
import { PdfTextLayer } from "./PdfTextLayer";

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;

const MIN_TEXT_LENGTH = 3;

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [textContent, setTextContent] = useState<PdfTextContent | null>(null);
  const [util, setUtil] = useState<{
    transform(m1: number[], m2: number[]): number[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadPdf(file), getUtil()]).then(([doc, u]) => {
      if (cancelled) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(1);
      setUtil(u);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    void pdfDoc.getPage(currentPage).then(async (page: PDFPageProxy) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = vp.width * dpr;
      canvas.height = vp.height * dpr;
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTaskRef.current?.cancel();
      const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        // superseded by a newer render — ignore
        return;
      }
      if (cancelled) return;

      const raw = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of raw.items as unknown[]) {
        const candidate = item as {
          str?: unknown;
          transform?: unknown;
          width?: unknown;
          height?: unknown;
        };
        if (
          typeof candidate.str === "string" &&
          Array.isArray(candidate.transform)
        ) {
          items.push({
            str: candidate.str,
            transform: candidate.transform as number[],
            width: typeof candidate.width === "number" ? candidate.width : 0,
            height: typeof candidate.height === "number" ? candidate.height : 0,
          });
        }
      }
      const joinedLength = items.reduce(
        (sum, i) => sum + i.str.trim().length,
        0
      );
      onPageHasNoText(joinedLength < MIN_TEXT_LENGTH);

      setViewport(vp);
      setTextContent({ items });
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale, onPageHasNoText]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("prevPage")}
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
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
            onClick={() =>
              setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
            }
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
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
        <div
          className="relative shadow-md"
          style={{ width: viewport?.width, height: viewport?.height }}
        >
          <canvas ref={canvasRef} />
          {viewport && textContent && util && (
            <PdfTextLayer
              textContent={textContent}
              viewport={viewport}
              util={util}
              onTextSelected={onTextSelected}
            />
          )}
        </div>
      </div>
    </div>
  );
}
