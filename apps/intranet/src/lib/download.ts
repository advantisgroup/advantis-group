import { toast } from "sonner";

/** Reads a fetch Response's body via its stream, reporting progress against
 *  `Content-Length` when present (`null` fraction when the length is
 *  unknown) — falls back to a plain `.blob()` when there's no progress
 *  listener or the body can't be streamed. */
async function fetchBlobWithProgress(
  url: string,
  init: RequestInit | undefined,
  onProgress?: (fraction: number | null) => void,
): Promise<Blob> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error("Download failed");
  if (!res.body || !onProgress) return res.blob();

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(total > 0 ? received / total : null);
  }
  return new Blob(chunks);
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads `url` and saves it as `name`, streaming the response so large
 * files report real progress instead of a silent multi-second stall. A
 * progress toast only appears once the transfer runs past ~400ms, so small,
 * fast downloads don't flicker one. `label` is the toast's translated
 * "Downloading…" text.
 */
export async function downloadWithProgress(
  url: string,
  name: string,
  label: string,
  init?: RequestInit,
): Promise<void> {
  let toastId: string | number | undefined;
  const timer = setTimeout(() => {
    toastId = toast.loading(label);
  }, 400);
  try {
    const blob = await fetchBlobWithProgress(url, init, (fraction) => {
      if (toastId === undefined) return;
      toast.loading(fraction != null ? `${label} ${Math.round(fraction * 100)}%` : label, {
        id: toastId,
      });
    });
    saveBlob(blob, name);
  } finally {
    clearTimeout(timer);
    if (toastId !== undefined) toast.dismiss(toastId);
  }
}

/** Fetches `url` and hands the bytes back as a `File` (no save-to-disk, no
 *  progress toast) — used to pull a OneDrive item's bytes into features that
 *  already accept local uploads (chat, announcements, …). */
export async function fetchAsFile(
  url: string,
  name: string,
  mimeType: string | undefined,
  init?: RequestInit,
): Promise<File> {
  const blob = await fetchBlobWithProgress(url, init);
  return new File([blob], name, {
    type: mimeType || blob.type || "application/octet-stream",
  });
}
