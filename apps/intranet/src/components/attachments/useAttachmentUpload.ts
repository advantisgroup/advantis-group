"use client";

import { useCallback, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type OneDriveItem } from "@advantis/types";
import { useMutation } from "convex/react";

import {
  deleteUploadedAttachments,
  isImage,
  MAX_ATTACHMENT_BYTES,
  type UploadedAttachment,
  uploadToConvex,
} from "@/lib/upload";

export interface OneDriveSource {
  driveItemId: string;
  path: string;
}

export interface AttachmentEntry {
  file: File;
  /** 0..1 while `uploading` is true; meaningless otherwise. */
  progress: number;
  oneDriveSource?: OneDriveSource;
}

/**
 * Shared attachment-picking + upload state for chat and announcements: local
 * file picks and OneDrive imports share one list, uploads run in parallel
 * with live per-file progress, and a failed send rolls back whatever already
 * made it into Convex storage instead of leaving it orphaned.
 */
export function useAttachmentUpload() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const deleteFile = useMutation(api.files.deleteFile);

  const [entries, setEntries] = useState<AttachmentEntry[]>([]);
  const [uploading, setUploading] = useState(false);

  const totalSize = useMemo(() => entries.reduce((sum, e) => sum + e.file.size, 0), [entries]);

  /** Returns false (and adds nothing) if the combined size would exceed the cap. */
  const add = useCallback(
    (files: File[]): boolean => {
      const next = [...entries];
      for (const f of files) {
        if (!next.some((e) => e.file.name === f.name && e.file.size === f.size)) {
          next.push({ file: f, progress: 0 });
        }
      }
      if (next.reduce((sum, e) => sum + e.file.size, 0) > MAX_ATTACHMENT_BYTES) {
        return false;
      }
      setEntries(next);
      return true;
    },
    [entries],
  );

  /**
   * Like `add`, but checks each file against `maxBytesPerFile` individually
   * instead of capping the combined batch — for callers whose upload path
   * (e.g. OneDrive, one request per file) validates each file independently
   * server-side rather than treating the whole selection as one payload.
   * Returns the files that didn't pass so the caller can report exactly
   * which ones were skipped.
   */
  const addPerFile = useCallback((files: File[], maxBytesPerFile: number): File[] => {
    const rejected: File[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > maxBytesPerFile) {
        rejected.push(f);
      } else {
        accepted.push(f);
      }
    }
    if (accepted.length > 0) {
      setEntries((prev) => {
        const next = [...prev];
        for (const f of accepted) {
          if (!next.some((e) => e.file.name === f.name && e.file.size === f.size)) {
            next.push({ file: f, progress: 0 });
          }
        }
        return next;
      });
    }
    return rejected;
  }, []);

  const addOneDriveFile = useCallback(
    (file: File, item: OneDriveItem): boolean => {
      const added = add([file]);
      if (added) {
        setEntries((prev) =>
          prev.map((e) =>
            e.file === file
              ? {
                  ...e,
                  oneDriveSource: { driveItemId: item.id, path: item.path },
                }
              : e,
          ),
        );
      }
      return added;
    },
    [add],
  );

  const remove = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Drop one entry by file reference rather than index — for a caller that
   *  finishes entries one at a time out of order (e.g. a parallel non-Convex
   *  upload batch) and can't track a stable index into the live array. */
  const removeByFile = useCallback((file: File) => {
    setEntries((prev) => prev.filter((e) => e.file !== file));
  }, []);

  const reset = useCallback(() => setEntries([]), []);

  /** Live progress for a non-Convex upload path (e.g. OneDrive) driving this
   *  same staged list — `uploadAll` below only covers Convex storage. */
  const setFileProgress = useCallback((file: File, fraction: number) => {
    setEntries((prev) => prev.map((e) => (e.file === file ? { ...e, progress: fraction } : e)));
  }, []);

  /** Best-effort delete of already-uploaded attachments, e.g. after the
   *  follow-up `sendMessage`/`create` call rejects. */
  const rollback = useCallback(
    (attachments: UploadedAttachment[]) => deleteUploadedAttachments(deleteFile, attachments),
    [deleteFile],
  );

  /**
   * Uploads every current entry to Convex storage in parallel, tracking live
   * per-file progress. If any file fails, the ones that did succeed are
   * rolled back before throwing, so a partial failure never orphans storage.
   */
  const uploadAll = useCallback(async (): Promise<UploadedAttachment[]> => {
    if (entries.length === 0) return [];
    setUploading(true);
    try {
      const results = await Promise.allSettled(
        entries.map((entry) =>
          uploadToConvex(
            () => generateUploadUrl({}),
            entry.file,
            (fraction) =>
              setEntries((prev) =>
                prev.map((e) => (e.file === entry.file ? { ...e, progress: fraction } : e)),
              ),
          ).then(
            (storageId): UploadedAttachment => ({
              storageId,
              kind: isImage(entry.file) ? "image" : "file",
              name: entry.file.name,
              size: entry.file.size,
              contentType: entry.file.type || undefined,
              oneDriveItemId: entry.oneDriveSource?.driveItemId,
              oneDrivePath: entry.oneDriveSource?.path,
            }),
          ),
        ),
      );

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<UploadedAttachment> => r.status === "fulfilled")
        .map((r) => r.value);

      if (results.some((r) => r.status === "rejected")) {
        await rollback(succeeded);
        throw new Error("One or more attachments failed to upload");
      }
      return succeeded;
    } finally {
      setUploading(false);
    }
  }, [entries, generateUploadUrl, rollback]);

  return {
    entries,
    totalSize,
    uploading,
    add,
    addPerFile,
    addOneDriveFile,
    remove,
    removeByFile,
    reset,
    uploadAll,
    rollback,
    setFileProgress,
    setUploading,
  };
}

export type UseAttachmentUpload = ReturnType<typeof useAttachmentUpload>;
