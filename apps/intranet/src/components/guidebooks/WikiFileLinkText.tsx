"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { createPortal } from "react-dom";

import { AttachmentThumb, type AttachmentThumbMeta } from "@/components/guidebooks/AttachmentThumb";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { RichText } from "@/components/ui/rich-text";
import { formatFileSize } from "@/lib/upload";

export interface WikiFileLinkAttachment extends AttachmentThumbMeta {
  size?: number | null;
  createdAt: number;
}

/**
 * Renders wiki-entry rich text, plus hover/click behavior for the
 * `.wiki-file-chip` spans a "linked file" insert produces (see
 * `useRichTextController.insertFileLink` and the `.wiki-file-chip` CSS).
 * Chips are matched to a live attachment by name rather than by id — the
 * same key works whether the file was already uploaded (editing) or is
 * still just a staged pick (composing a new entry, see
 * `useWikiEntryForm`'s `fileLinkCandidates`).
 *
 * Kept as a thin wrapper around the generic `RichText` (rather than baking
 * this in there) so that component stays free of any file-viewer/attachment
 * coupling — event delegation on this wrapper works regardless of what
 * `RichText` does internally, since neither hover nor click here needs to
 * stop propagation.
 */
export function WikiFileLinkText({
  html,
  attachments,
  className,
}: {
  html: string;
  attachments: WikiFileLinkAttachment[] | undefined;
  className?: string;
}) {
  const { openFileViewer } = useFileViewer();
  const [hover, setHover] = useState<{ name: string; rect: DOMRect } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const byName = useMemo(() => {
    const map = new Map<string, WikiFileLinkAttachment>();
    for (const a of attachments ?? []) if (!map.has(a.name)) map.set(a.name, a);
    return map;
  }, [attachments]);

  function chipTarget(target: HTMLElement): HTMLElement | null {
    return target.closest<HTMLElement>("[data-wiki-file-name]");
  }

  function onMouseOver(e: ReactMouseEvent<HTMLDivElement>) {
    const chip = chipTarget(e.target as HTMLElement);
    if (!chip) return;
    const name = chip.getAttribute("data-wiki-file-name");
    if (!name || !byName.has(name)) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHover({ name, rect: chip.getBoundingClientRect() });
  }

  function onMouseOut(e: ReactMouseEvent<HTMLDivElement>) {
    if (!chipTarget(e.target as HTMLElement)) return;
    closeTimer.current = setTimeout(() => setHover(null), 100);
  }

  function onClick(e: ReactMouseEvent<HTMLDivElement>) {
    const chip = chipTarget(e.target as HTMLElement);
    if (!chip) return;
    const name = chip.getAttribute("data-wiki-file-name");
    const attachment = name ? byName.get(name) : undefined;
    if (!attachment) return;
    e.preventDefault();
    openFileViewer({
      oneDriveItemId: attachment.oneDriveItemId ?? undefined,
      name: attachment.name,
      contentType: attachment.contentType ?? undefined,
      size: attachment.size ?? undefined,
      modifiedAt: attachment.createdAt,
      url: attachment.legacyUrl ?? undefined,
    });
  }

  const hoverAttachment = hover ? byName.get(hover.name) : null;

  return (
    <div onMouseOver={onMouseOver} onMouseOut={onMouseOut} onClick={onClick}>
      <RichText html={html} className={className} />
      {hover &&
        hoverAttachment &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => closeTimer.current && clearTimeout(closeTimer.current)}
            onMouseLeave={() => setHover(null)}
            className="fixed z-50 flex w-56 items-center gap-2.5 rounded-lg border border-border/70 bg-popover p-2.5 shadow-overlay"
            style={{ top: hover.rect.bottom + 6, left: hover.rect.left }}
          >
            <AttachmentThumb
              attachment={hoverAttachment}
              className="size-10 shrink-0 overflow-hidden rounded-md"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{hoverAttachment.name}</span>
              {hoverAttachment.size != null && (
                <span className="block text-[11px] text-muted-foreground">
                  {formatFileSize(hoverAttachment.size)}
                </span>
              )}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
