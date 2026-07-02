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

/**
 * Upload a file to Convex storage via a short-lived upload URL and return its
 * storageId. `generateUploadUrl` is the `api.files.generateUploadUrl` mutation.
 */
export async function uploadToConvex(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<Id<"_storage">> {
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
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
