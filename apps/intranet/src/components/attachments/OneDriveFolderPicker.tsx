"use client";

import { useCallback, useEffect, useState } from "react";

import { ChevronRight, Folder, FolderOpen, FolderPlus, Home } from "lucide-react";
import { useTranslations } from "next-intl";

import { NewFolderDialog } from "@/components/onedrive/FileDialogs";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { cn } from "@/lib/utils";

/**
 * Destination folder for a wiki/HR OneDrive upload. Browsing beats a flat
 * dropdown here: the dropdown could only ever list the first level under
 * `basePath`, so anything nested was unreachable and picking a destination
 * meant guessing from a bare list of names with no sense of where you were.
 *
 * `value` is a relative path under `basePath` ("" = the base itself) and may
 * be nested — the attach endpoint sanitizes and appends it as-is, so no
 * backend change is needed to go deeper than one level.
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
  const t = useTranslations("Files");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 max-w-full justify-start gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="size-3.5 shrink-0" />
        <span className="truncate">{value || t("noFolder")}</span>
      </Button>
      <FolderBrowser
        open={open}
        onOpenChange={setOpen}
        basePath={basePath}
        value={value}
        onChange={onChange}
      />
    </>
  );
}

function FolderBrowser({
  open,
  onOpenChange,
  basePath,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  basePath: string;
  value: string;
  onChange: (folder: string) => void;
}) {
  const od = useOneDriveApi();
  const t = useTranslations("Files");
  const tc = useTranslations("Common");
  // Browsing is a draft: nothing is committed until "select this folder", so
  // backing out of a wrong turn doesn't change where the upload lands.
  const [path, setPath] = useState(value);
  const [folders, setFolders] = useState<string[] | undefined>(undefined);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const fullPath = path ? `${basePath}/${path}` : basePath;

  const refresh = useCallback(() => {
    setFolders(undefined);
    void od
      .list(fullPath)
      // The base folder is created lazily on first upload, so a 404 here just
      // means nothing has been filed under it yet.
      .catch(() => ({ items: [] }))
      .then((listing) =>
        setFolders(listing.items.filter((i) => i.type === "folder").map((i) => i.name)),
      );
  }, [od, fullPath]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (open) setPath(value);
    // Re-syncing on every `value` change would fight the user mid-browse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const segments = path ? path.split("/") : [];

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("chooseFolder")}
        description={t("chooseFolderHint")}
        footer={
          <>
            <Button variant="ghost" className="sm:min-w-24" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              className="sm:min-w-32"
              onClick={() => {
                onChange(path);
                onOpenChange(false);
              }}
            >
              {t("selectThisFolder")}
            </Button>
          </>
        }
      >
        <nav className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setPath("")}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground",
              segments.length === 0 && "font-semibold text-foreground",
            )}
          >
            <Home className="size-3" />
            {t("noFolder")}
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <ChevronRight className="size-3 shrink-0" />
              <button
                type="button"
                onClick={() => setPath(segments.slice(0, i + 1).join("/"))}
                className={cn(
                  "max-w-[10rem] truncate rounded px-1.5 py-1 hover:bg-accent hover:text-foreground",
                  i === segments.length - 1 && "font-semibold text-foreground",
                )}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>

        <div className="min-h-[9rem] rounded-lg border border-border/70">
          {folders === undefined ? (
            <SkeletonRows className="py-2" />
          ) : folders.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("noSubfolders")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {folders.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setPath(path ? `${path}/${name}` : name)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setNewFolderOpen(true)}
        >
          <FolderPlus className="mr-1.5 size-3.5" />
          {t("newFolder")}
        </Button>
      </ResponsiveDialog>

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        path={fullPath}
        onDone={refresh}
      />
    </>
  );
}
