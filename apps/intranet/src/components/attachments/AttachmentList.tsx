"use client";

import { useEffect, useMemo } from "react";

import { Cloud, File as FileIcon, FileArchive, FileSpreadsheet, FileText, X } from "lucide-react";

import { formatFileSize, isImage } from "@/lib/upload";

import { type AttachmentEntry } from "./useAttachmentUpload";

function fileTypeIcon(file: File, className: string) {
  const type = file.type;
  const name = file.name.toLowerCase();
  if (type.includes("pdf")) return <FileText className={className} />;
  if (type.includes("sheet") || type.includes("excel") || name.endsWith(".csv"))
    return <FileSpreadsheet className={className} />;
  if (type.includes("zip") || type.includes("compressed"))
    return <FileArchive className={className} />;
  if (type.includes("word") || type.includes("document")) return <FileText className={className} />;
  return <FileIcon className={className} />;
}

/** Attachment chips shared by chat and announcements: thumbnail/icon, name,
 *  size or a live progress bar while uploading, and a remove button. */
export function AttachmentList({
  entries,
  uploading,
  onRemove,
  removeLabel,
}: {
  entries: AttachmentEntry[];
  uploading: boolean;
  onRemove: (index: number) => void;
  removeLabel: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <AttachmentChip
          key={`${entry.file.name}-${entry.file.size}-${i}`}
          entry={entry}
          uploading={uploading}
          onRemove={() => onRemove(i)}
          removeLabel={removeLabel}
        />
      ))}
    </div>
  );
}

function AttachmentChip({
  entry,
  uploading,
  onRemove,
  removeLabel,
}: {
  entry: AttachmentEntry;
  uploading: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  const { file, progress, oneDriveSource } = entry;
  const preview = useMemo(() => (isImage(file) ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const showProgress = uploading && progress > 0 && progress < 1;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
      <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          fileTypeIcon(file, "size-4")
        )}
        {oneDriveSource && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-background ring-1 ring-border">
            <Cloud className="size-2.5 text-blue-500" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.name}</span>
        {showProgress ? (
          <span className="mt-1 flex items-center gap-1.5">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {Math.round(progress * 100)}%
            </span>
          </span>
        ) : (
          <span className="block text-muted-foreground">{formatFileSize(file.size)}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        disabled={uploading}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
