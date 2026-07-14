import { type Id } from "@advantis/convex/dataModel";

/** An uploaded attachment with the metadata announcements/chat persist. */
export interface UploadedAttachment {
  storageId: Id<"_storage">;
  kind: "image" | "file";
  name: string;
  size?: number;
  contentType?: string;
  /** Present when imported from OneDrive — links the attachment back to its source. */
  oneDriveItemId?: string;
  oneDrivePath?: string;
}

/** Combined attachment size ceiling shared by chat messages and announcements
 *  — mirrors `MAX_ATTACHMENT_BYTES` in `packages/convex/convex/lib/attachments.ts`,
 *  which is the actual server-side enforcement (this is just the client-side
 *  check so the composer can reject before spending an upload round trip). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Upload a file to Convex storage via a short-lived upload URL and return its
 * storageId. `generateUploadUrl` is the `api.files.generateUploadUrl` mutation.
 * Uses XHR (rather than `fetch`) so `onProgress` can track real upload
 * progress, matching the pattern already proven in `onedrive-api.ts`'s
 * `upload()`.
 */
export function uploadToConvex(
  generateUploadUrl: () => Promise<string>,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<Id<"_storage">> {
  return new Promise<Id<"_storage">>((resolve, reject) => {
    void (async () => {
      try {
        const url = await generateUploadUrl();
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream"
        );
        xhr.upload.onprogress = e => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const { storageId } = JSON.parse(xhr.responseText) as {
              storageId: Id<"_storage">;
            };
            resolve(storageId);
          } else {
            reject(new Error("Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Upload failed"));
      }
    })();
  });
}

/**
 * Best-effort cleanup for attachments that made it into Convex storage before
 * a send ultimately failed (e.g. the follow-up `sendMessage`/`create` call
 * rejected) — otherwise those blobs are orphaned forever. Failures here are
 * swallowed; the user already saw the real error from the failed send.
 */
export async function deleteUploadedAttachments(
  deleteFile: (args: { storageId: Id<"_storage"> }) => Promise<unknown>,
  attachments: { storageId: Id<"_storage"> }[]
): Promise<void> {
  await Promise.allSettled(
    attachments.map(a => deleteFile({ storageId: a.storageId }))
  );
}

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable byte size, e.g. "24 KB" / "1.3 MB" / "2.1 GB" / "1 TB". */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    FILE_SIZE_UNITS.length - 1
  );
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(decimals)} ${FILE_SIZE_UNITS[exponent]}`;
}
