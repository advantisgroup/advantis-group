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

  const totalSize = useMemo(
    () => entries.reduce((sum, e) => sum + e.file.size, 0),
    [entries]
  );

  /** Returns false (and adds nothing) if the combined size would exceed the cap. */
  const add = useCallback(
    (files: File[]): boolean => {
      const next = [...entries];
      for (const f of files) {
        if (!next.some(e => e.file.name === f.name && e.file.size === f.size)) {
          next.push({ file: f, progress: 0 });
        }
      }
      if (
        next.reduce((sum, e) => sum + e.file.size, 0) > MAX_ATTACHMENT_BYTES
      ) {
        return false;
      }
      setEntries(next);
      return true;
    },
    [entries]
  );

  const addOneDriveFile = useCallback(
    (file: File, item: OneDriveItem): boolean => {
      const added = add([file]);
      if (added) {
        setEntries(prev =>
          prev.map(e =>
            e.file === file
              ? {
                  ...e,
                  oneDriveSource: { driveItemId: item.id, path: item.path },
                }
              : e
          )
        );
      }
      return added;
    },
    [add]
  );

  const remove = useCallback((index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => setEntries([]), []);

  /** Best-effort delete of already-uploaded attachments, e.g. after the
   *  follow-up `sendMessage`/`create` call rejects. */
  const rollback = useCallback(
    (attachments: UploadedAttachment[]) =>
      deleteUploadedAttachments(deleteFile, attachments),
    [deleteFile]
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
        entries.map(entry =>
          uploadToConvex(
            () => generateUploadUrl({}),
            entry.file,
            fraction =>
              setEntries(prev =>
                prev.map(e =>
                  e.file === entry.file ? { ...e, progress: fraction } : e
                )
              )
          ).then(
            (storageId): UploadedAttachment => ({
              storageId,
              kind: isImage(entry.file) ? "image" : "file",
              name: entry.file.name,
              size: entry.file.size,
              contentType: entry.file.type || undefined,
              oneDriveItemId: entry.oneDriveSource?.driveItemId,
              oneDrivePath: entry.oneDriveSource?.path,
            })
          )
        )
      );

      const succeeded = results
        .filter(
          (r): r is PromiseFulfilledResult<UploadedAttachment> =>
            r.status === "fulfilled"
        )
        .map(r => r.value);

      if (results.some(r => r.status === "rejected")) {
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
    addOneDriveFile,
    remove,
    reset,
    uploadAll,
    rollback,
  };
}

export type UseAttachmentUpload = ReturnType<typeof useAttachmentUpload>;
