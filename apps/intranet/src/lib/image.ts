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
        blob => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
        "image/jpeg",
        0.9
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
