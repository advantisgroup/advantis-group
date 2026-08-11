/** Builds the shareable URL for a given OneDrive-relative path, under
 * `routeBase` (defaults to the general file browser's `/files`; the
 * confined Wiki/HR explorer views mount `FileBrowser` at their own base).
 *
 * `rootPath` is that confined view's OneDrive root ("Team/Wiki"), which the
 * page re-attaches when it reads the URL back. It has to come off here or
 * every link doubles the prefix — `/guidebooks/files/Team/Wiki/x` resolving
 * to `Team/Wiki/Team/Wiki/x`, which is why browsing those views 404'd on
 * folders that plainly existed. */
export function pathToUrl(path: string, routeBase = "/files", rootPath = ""): string {
  const relative =
    rootPath && (path === rootPath || path.startsWith(`${rootPath}/`))
      ? path.slice(rootPath.length)
      : path;
  const segments = relative.split("/").filter(Boolean).map(encodeURIComponent);
  return segments.length === 0 ? routeBase : `${routeBase}/${segments.join("/")}`;
}
