import { Errors } from "./errors.js";

/** Same authorization shape as OneDrive's wiki-attach endpoint: manager rank
 *  or the standalone `manage_guidebooks` capability (`canWriteWiki`). */
export function requireWikiManageAccess(user: { role: string; canWriteWiki?: boolean }): void {
  if (user.role !== "admin" && user.role !== "manager" && !user.canWriteWiki) {
    throw Errors.forbidden("Wiki management access required");
  }
}
