"use client";

import * as React from "react";
import { useMemo, useRef, useState } from "react";

import { type PdfTextContent, type PdfTextItem } from "./pdfjs-client";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LineRecord {
  items: PdfTextItem[];
  rect: Rect;
  text: string;
  /** Cumulative start offset of each item within `text`. */
  itemOffsets: number[];
}

interface ParagraphRecord {
  lines: LineRecord[];
  rect: Rect;
  text: string;
}

/** pdf.js's own text-layer recipe: combine the viewport transform with the
 * item's transform to get its on-screen rect. */
function itemRect(
  item: PdfTextItem,
  util: PdfjsUtil,
  viewportTransform: number[]
): Rect {
  const tx = util.transform(viewportTransform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const scaleX = Math.hypot(tx[0], tx[1]) || 1;
  return {
    left: tx[4],
    top: tx[5] - fontHeight,
    width: item.width * scaleX,
    height: fontHeight,
  };
}

function unionRect(rects: Rect[]): Rect {
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.left + r.width));
  const bottom = Math.max(...rects.map(r => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

function buildLines(
  items: PdfTextItem[],
  util: PdfjsUtil,
  viewportTransform: number[]
): LineRecord[] {
  const withRects = items
    .filter(item => item.str.trim().length > 0)
    .map(item => ({ item, rect: itemRect(item, util, viewportTransform) }));

  const lines: { items: PdfTextItem[]; rects: Rect[] }[] = [];
  for (const { item, rect } of withRects) {
    const last = lines[lines.length - 1];
    const lastRect = last?.rects[last.rects.length - 1];
    const sameLine =
      lastRect && Math.abs(lastRect.top - rect.top) < rect.height * 0.5;
    if (sameLine && last) {
      last.items.push(item);
      last.rects.push(rect);
    } else {
      lines.push({ items: [item], rects: [rect] });
    }
  }

  return lines.map(line => {
    let text = "";
    const itemOffsets: number[] = [];
    for (const item of line.items) {
      itemOffsets.push(text.length);
      text += item.str;
    }
    return {
      items: line.items,
      rect: unionRect(line.rects),
      text,
      itemOffsets,
    };
  });
}

function buildParagraphs(lines: LineRecord[]): ParagraphRecord[] {
  const paragraphs: LineRecord[][] = [];
  for (const line of lines) {
    const last = paragraphs[paragraphs.length - 1];
    const lastLine = last?.[last.length - 1];
    const gap = lastLine
      ? line.rect.top - (lastLine.rect.top + lastLine.rect.height)
      : 0;
    const sameParagraph = lastLine && gap < lastLine.rect.height * 0.6;
    if (sameParagraph && last) {
      last.push(line);
    } else {
      paragraphs.push([line]);
    }
  }
  return paragraphs.map(group => ({
    lines: group,
    rect: unionRect(group.map(l => l.rect)),
    text: group.map(l => l.text).join(" "),
  }));
}

function lineOffsetAtX(
  line: LineRecord,
  x: number,
  util: PdfjsUtil,
  viewportTransform: number[]
): number {
  for (let i = 0; i < line.items.length; i++) {
    const item = line.items[i];
    const rect = itemRect(item, util, viewportTransform);
    if (x <= rect.left) return line.itemOffsets[i];
    if (x <= rect.left + rect.width) {
      const proportion = rect.width > 0 ? (x - rect.left) / rect.width : 0;
      return line.itemOffsets[i] + Math.round(proportion * item.str.length);
    }
  }
  return line.text.length;
}

interface PdfjsUtil {
  transform(m1: number[], m2: number[]): number[];
}

export function PdfTextLayer({
  textContent,
  viewport,
  util,
  onTextSelected,
}: {
  textContent: PdfTextContent;
  viewport: { width: number; height: number; transform: number[] };
  util: PdfjsUtil;
  onTextSelected: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const justDragged = useRef(false);

  const lines = useMemo(
    () => buildLines(textContent.items, util, viewport.transform),
    [textContent, util, viewport.transform]
  );
  const paragraphs = useMemo(() => buildParagraphs(lines), [lines]);

  function localPoint(e: { clientX: number; clientY: number }) {
    const box = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) };
  }

  function lineAt(x: number, y: number): LineRecord | null {
    return (
      lines.find(
        l =>
          x >= l.rect.left &&
          x <= l.rect.left + l.rect.width &&
          y >= l.rect.top &&
          y <= l.rect.top + l.rect.height
      ) ?? null
    );
  }

  function paragraphContaining(line: LineRecord): ParagraphRecord | null {
    return paragraphs.find(p => p.lines.includes(line)) ?? null;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const { x, y } = localPoint(e);
    if (dragStart.current) {
      const moved = Math.hypot(
        x - dragStart.current.x,
        y - dragStart.current.y
      );
      if (moved > 3) isDragging.current = true;
      if (isDragging.current) {
        const top = Math.min(dragStart.current.y, y);
        const bottom = Math.max(dragStart.current.y, y);
        const spanned = lines.filter(
          l => l.rect.top + l.rect.height >= top && l.rect.top <= bottom
        );
        if (spanned.length > 0)
          setDragRect(unionRect(spanned.map(l => l.rect)));
      }
      return;
    }
    const line = lineAt(x, y);
    setHoverRect(line?.rect ?? null);
  }

  function handlePointerDown(e: React.PointerEvent) {
    const { x, y } = localPoint(e);
    dragStart.current = { x, y };
    isDragging.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function handlePointerUp(e: React.PointerEvent) {
    const { x, y } = localPoint(e);
    const start = dragStart.current;
    const wasDragging = isDragging.current;
    dragStart.current = null;
    isDragging.current = false;
    setDragRect(null);
    if (!start || !wasDragging) return;

    const top = Math.min(start.y, y);
    const bottom = Math.max(start.y, y);
    const spanned = lines
      .filter(l => l.rect.top + l.rect.height >= top && l.rect.top <= bottom)
      .sort((a, b) => a.rect.top - b.rect.top);
    if (spanned.length === 0) return;

    const fromX = start.y <= y ? start.x : x;
    const toX = start.y <= y ? x : start.x;
    const parts = spanned.map((line, i) => {
      if (spanned.length === 1) {
        const from = lineOffsetAtX(
          line,
          Math.min(fromX, toX),
          util,
          viewport.transform
        );
        const to = lineOffsetAtX(
          line,
          Math.max(fromX, toX),
          util,
          viewport.transform
        );
        return line.text.slice(Math.min(from, to), Math.max(from, to));
      }
      if (i === 0) {
        const from = lineOffsetAtX(line, fromX, util, viewport.transform);
        return line.text.slice(from);
      }
      if (i === spanned.length - 1) {
        const to = lineOffsetAtX(line, toX, util, viewport.transform);
        return line.text.slice(0, to);
      }
      return line.text;
    });
    const selected = parts.join("\n").trim();
    if (selected) {
      justDragged.current = true;
      onTextSelected(selected);
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const { x, y } = localPoint(e);
    const line = lineAt(x, y);
    if (line?.text.trim()) onTextSelected(line.text.trim());
  }

  function handleDoubleClick(e: React.MouseEvent) {
    const { x, y } = localPoint(e);
    const line = lineAt(x, y);
    if (!line) return;
    const paragraph = paragraphContaining(line);
    const text = (paragraph?.text ?? line.text).trim();
    if (text) onTextSelected(text);
  }

  return (
    <div
      ref={containerRef}
      className="pdf-text-pane absolute inset-0"
      style={{
        width: viewport.width,
        height: viewport.height,
        userSelect: "none",
      }}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoverRect(null)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {hoverRect && !dragRect && (
        <div
          className="pointer-events-none absolute rounded-sm bg-info/20"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}
      {dragRect && (
        <div
          className="pointer-events-none absolute rounded-sm bg-info/30"
          style={{
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
          }}
        />
      )}
    </div>
  );
}
