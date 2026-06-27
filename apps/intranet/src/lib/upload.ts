import { type Id } from "@advantis/convex/dataModel";

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
