"use client";

import { useCallback, useEffect, useState } from "react";

import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { NewFolderDialog } from "@/components/onedrive/FileDialogs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOneDriveApi } from "@/lib/onedrive-api";

const ROOT_VALUE = "__root__";
const NEW_FOLDER_VALUE = "__new__";

/**
 * Folder choice for a wiki/HR OneDrive upload — lists the existing
 * subfolders directly under `basePath` (created lazily on first upload, so
 * a 404 there just means "no folders yet") and lets the uploader either
 * pick one, stay at the root, or create a new one via the same dialog the
 * full file browser uses.
 */
export function OneDriveFolderPicker({
  basePath,
  value,
  onChange,
}: {
  basePath: string;
  value: string;
  onChange: (folder: string) => void;
}) {
  const od = useOneDriveApi();
  const t = useTranslations("Files");
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const refresh = useCallback(() => {
    void od
      .list(basePath)
      .then((listing) =>
        setFolders(listing.items.filter((i) => i.type === "folder").map((i) => i.name)),
      )
      .catch(() => setFolders([]));
  }, [od, basePath]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  return (
    <>
      <Select
        value={value || ROOT_VALUE}
        onValueChange={(v) => {
          if (v === NEW_FOLDER_VALUE) setNewFolderOpen(true);
          else onChange(v === ROOT_VALUE ? "" : v);
        }}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ROOT_VALUE}>{t("noFolder")}</SelectItem>
          {folders.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
          <SelectItem value={NEW_FOLDER_VALUE}>
            <span className="flex items-center gap-1.5">
              <FolderPlus className="size-3.5" />
              {t("newFolder")}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        path={basePath}
        onDone={refresh}
      />
    </>
  );
}
