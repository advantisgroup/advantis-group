/**
 * Wiki/HR OneDrive attachments always live under these two subtrees (see
 * `wikiFolderBase()`/`hrFolderBase()` in apps/api's `lib/onedrive/access.ts`,
 * the actual source of truth server-side). Duplicated here only so the
 * frontend can list/browse them — keep in sync if `ONEDRIVE_TEAM_PATH` is
 * ever customized away from the "Team" default.
 */
export const WIKI_FOLDER_BASE = "Team/Wiki";
export const HR_FOLDER_BASE = "Team/HR";
