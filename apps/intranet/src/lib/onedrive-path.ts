/** Builds the shareable /files URL for a given OneDrive-relative path. */
export function pathToUrl(path: string): string {
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
  return segments.length === 0 ? "/files" : `/files/${segments.join("/")}`;
}
