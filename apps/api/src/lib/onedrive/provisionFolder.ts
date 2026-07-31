import { ApiError } from "../errors.js";
import { createFolder, getItemByPath, type GraphItem } from "./graph.js";

/**
 * Get-or-create every segment of an AG-relative path, returning the final
 * folder's Graph item. Used to lazily provision `Team/Wiki/<slug>` the first
 * time a guidebook page gets an attachment, and `Team/HR/<employee>` the
 * first time an employee document is uploaded — both live in OneDrive (not
 * Convex storage) so anyone with Team-zone read access (i.e. every active
 * user) already has them as a backup, no extra permission grant needed. One
 * folder per slug/employee (not per team/topic): renaming/recategorizing the
 * owning record doesn't need to relocate its files.
 */
export async function ensureFolderPath(relPath: string): Promise<GraphItem> {
  const segments = relPath.split("/").filter(Boolean);
  let acc = "";
  let item: GraphItem = await getItemByPath("");
  for (const seg of segments) {
    const path = acc ? `${acc}/${seg}` : seg;
    try {
      item = await getItemByPath(path);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        item = await createFolder(item.id, seg);
      } else {
        throw err;
      }
    }
    acc = path;
  }
  return item;
}
