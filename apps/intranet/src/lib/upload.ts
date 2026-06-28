import { type Id } from "@advantis/convex/dataModel";

/** An uploaded attachment with the metadata announcements/chat persist. */
export interface UploadedAttachment {
  storageId: Id<"_storage">;
  kind: "image" | "file";
  name: string;
  size?: number;
  contentType?: string;
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

/** Human-readable byte size, e.g. "24 KB" / "1.3 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
