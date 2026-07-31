/** Builds the shareable URL for a given OneDrive-relative path, under
 * `routeBase` (defaults to the general file browser's `/files`; the
 * confined Wiki/HR explorer views mount `FileBrowser` at their own base). */
export function pathToUrl(path: string, routeBase = "/files"): string {
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
  return segments.length === 0 ? routeBase : `${routeBase}/${segments.join("/")}`;
}
