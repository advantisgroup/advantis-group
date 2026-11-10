/**
 * Center-crops an image file to a square and resizes it (canvas-based, no
 * dependency) — keeps avatar uploads small and uniformly framed.
 */
export async function cropToSquare(file: File, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    const target = Math.min(size, side);
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
        "image/jpeg",
        0.9,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks a photo so its longest side is at most `maxSide` and re-encodes it
 * as JPEG — phone photos are several MB, more than an API request may carry.
 * Enough detail stays for printed labels and plug shapes.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Shrink failed"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
