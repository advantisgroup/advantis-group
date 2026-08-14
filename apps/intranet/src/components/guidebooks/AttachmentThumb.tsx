"use client";

import { useEffect, useState } from "react";

import { FileArchive, FileCode2, FileQuestion, FileText } from "lucide-react";

import { detectFileKind, type FileKind } from "@/components/file-viewer/file-kind";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { cn } from "@/lib/utils";

/** The subset of attachment metadata needed to render a thumbnail — matches
 *  both `guidebookAttachments.list` rows and pending (not-yet-uploaded)
 *  picks, so the same component works before and after upload. */
export interface AttachmentThumbMeta {
  name: string;
  contentType?: string | null;
  oneDriveItemId?: string | null;
  /** Convex-storage URL — legacy (pre-OneDrive) rows only. */
  legacyUrl?: string | null;
}

const KIND_STYLE: Record<FileKind["kind"], string> = {
  image: "",
  pdf: "bg-red-500/10 text-red-600 dark:text-red-400",
  docx: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  code: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  archive: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  text: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  unknown: "bg-muted text-muted-foreground",
};

function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  switch (kind.kind) {
    case "archive":
      return <FileArchive className={className} />;
    case "code":
      return <FileCode2 className={className} />;
    case "pdf":
    case "docx":
    case "text":
      return <FileText className={className} />;
    default:
      return <FileQuestion className={className} />;
  }
}

// Module-level so a thumbnail already resolved for a given OneDrive item
// doesn't get re-fetched every time its tile remounts (list re-sort, hover
// preview mounting a second copy of the same file, …). `null` is cached too
// (a permanently-failed lookup) to avoid hammering the endpoint on repeats.
const thumbCache = new Map<string, string | null>();

/** Resolves an image attachment's preview URL — Convex-storage `legacyUrl`
 *  directly, or a fetched-and-cached OneDrive thumbnail. Returns `null` for
 *  everything else (caller falls back to a kind icon). */
function useImageThumbnailUrl(
  oneDriveItemId: string | null | undefined,
  legacyUrl: string | null | undefined,
): string | null {
  const od = useOneDriveApi();
  const [url, setUrl] = useState<string | null>(
    legacyUrl ? legacyUrl : oneDriveItemId ? (thumbCache.get(oneDriveItemId) ?? null) : null,
  );

  useEffect(() => {
    if (legacyUrl || !oneDriveItemId) return;
    if (thumbCache.has(oneDriveItemId)) {
      setUrl(thumbCache.get(oneDriveItemId) ?? null);
      return;
    }
    let cancelled = false;
    void od
      .preview(oneDriveItemId)
      .then((r) => {
        const resolved = r.thumbnailUrl ?? r.previewUrl ?? null;
        thumbCache.set(oneDriveItemId, resolved);
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        thumbCache.set(oneDriveItemId, null);
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
    // `od` is a fresh memoized object most renders but stable in practice
    // (mirrors the same trade-off GlobalFileViewer makes for its own
    // OneDrive preview effect) — re-running on item identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneDriveItemId, legacyUrl]);

  return legacyUrl ?? url;
}

/**
 * A single attachment's preview: a real thumbnail for images (fetched from
 * OneDrive, or the direct Convex-storage URL for legacy rows), otherwise a
 * kind-colored icon (PDF/Word/code/archive/other) so files are at least
 * visually distinguishable at a glance instead of one flat generic icon.
 */
export function AttachmentThumb({
  attachment,
  className,
  iconClassName,
}: {
  attachment: AttachmentThumbMeta;
  className?: string;
  iconClassName?: string;
}) {
  const kind = detectFileKind(attachment.name, attachment.contentType ?? undefined);
  const thumbUrl = useImageThumbnailUrl(
    kind.kind === "image" ? attachment.oneDriveItemId : null,
    kind.kind === "image" ? attachment.legacyUrl : null,
  );

  if (kind.kind === "image" && thumbUrl) {
    return (
      <span className={cn("block overflow-hidden bg-muted", className)}>
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={cn("grid place-items-center", KIND_STYLE[kind.kind], className)}>
      <KindIcon kind={kind} className={cn("size-5", iconClassName)} />
    </span>
  );
}
