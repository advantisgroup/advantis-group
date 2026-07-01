"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type DriveQuota,
  type OneDriveItem,
  type OneDriveListing,
} from "@advantis/types";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Frown,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

import {
  NewFolderDialog,
  RenameDialog,
  ShareDialog,
  VersionsDialog,
} from "./FileDialogs";
import { FilePreviewDialog } from "./FilePreviewDialog";
import { UploadDropOverlay } from "./UploadDropOverlay";

/** File-type icon. Each branch renders a concrete (static) lucide component. */
function ItemIcon({
  item,
  className,
}: {
  item: OneDriveItem;
  className?: string;
}) {
  const cls = cn(
    className,
    item.type === "folder" ? "text-blue-500" : "text-muted-foreground"
  );
  if (item.type === "folder") return <Folder className={cls} />;
  const m = item.mimeType ?? "";
  if (m.startsWith("image/")) return <FileImage className={cls} />;
  if (m.includes("pdf")) return <FileText className={cls} />;
  if (m.includes("sheet") || m.includes("excel") || item.name.endsWith(".csv"))
    return <FileSpreadsheet className={cls} />;
  if (m.includes("zip") || m.includes("compressed"))
    return <FileArchive className={cls} />;
  if (m.includes("word") || m.includes("document"))
    return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

function QuotaBar({ quota }: { quota: DriveQuota }) {
  const t = useTranslations("Files");
  const pct =
    quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
        <div
          className={cn(
            "h-full rounded-full",
            pct > 90 ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {t("quota", {
          used: formatFileSize(quota.used),
          total: formatFileSize(quota.total),
        })}
      </span>
    </div>
  );
}

export function FileBrowser() {
  const t = useTranslations("Files");
  const od = useOneDriveApi();
  const confirm = useConfirm();
  const isMobile = useIsMobile();

  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<OneDriveListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<DriveQuota | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OneDriveItem[] | null>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<OneDriveItem | null>(null);
  const [shareItem, setShareItem] = useState<OneDriveItem | null>(null);
  const [versionsItem, setVersionsItem] = useState<OneDriveItem | null>(null);
  const [previewItem, setPreviewItem] = useState<OneDriveItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (next: string) => {
      setLoading(true);
      try {
        const data = await od.list(next);
        setListing(data);
        setPath(data.path);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
      }
    },
    [od, t]
  );

  // Resolve whether OneDrive is configured before firing any Graph-backed calls.
  useEffect(() => {
    void od
      .status()
      .then(s => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, [od]);

  useEffect(() => {
    if (configured !== true) return;
    void load("");
  }, [configured, load]);

  useEffect(() => {
    if (configured !== true) return;
    void od
      .quota()
      .then(setQuota)
      .catch(() => setQuota(null));
  }, [configured, od]);

  const refresh = useCallback(() => void load(path), [load, path]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const id = window.setTimeout(() => {
      void od
        .search(q)
        .then(r => setResults(r.items))
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [query, od]);

  const handleUpload = useCallback(
    async (files: File[], onProgress: (f: number) => void) => {
      if (!listing) return;
      const total = files.length;
      try {
        for (let i = 0; i < total; i++) {
          await od.upload(files[i], path, f => onProgress((i + f) / total));
        }
        refresh();
        toast.success(
          listing.canWrite
            ? t("uploadedCount", { count: total })
            : t("requestedCount", { count: total })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("genericError"));
        throw e;
      }
    },
    [listing, od, path, refresh, t]
  );

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const toastId = toast.loading(t("uploading"));
    void handleUpload(arr, () => {})
      .then(() => toast.dismiss(toastId))
      .catch(() => toast.dismiss(toastId));
  };

  const onDelete = async (item: OneDriveItem) => {
    const ok = await confirm({
      title: t("deleteTitle", { name: item.name }),
      description: t("deleteDesc"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await od.remove(item.id);
      toast.success(t("deleted"));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    }
  };

  const open = (item: OneDriveItem) => {
    if (item.type === "folder") {
      setQuery("");
      void load(item.path);
    } else {
      setPreviewItem(item);
    }
  };

  const items = results ?? listing?.items ?? [];
  const canWrite = listing?.canWrite ?? false;
  const canDrop = Boolean(listing && (listing.canWrite || listing.canRequest));

  // OneDrive credentials aren't set — dim the whole tab with a plain-text notice.
  if (configured === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center opacity-60">
        <Frown className="size-10 text-muted-foreground" />
        <p className="font-medium">{t("notConfiguredTitle")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("notConfiguredBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canDrop && (
        <UploadDropOverlay
          enabled={canDrop}
          requiresApproval={!canWrite}
          onUpload={handleUpload}
        />
      )}

      {/* Header: title + quota */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold md:text-xl">{t("title")}</h1>
        {quota && <QuotaBar quota={quota} />}
      </div>

      {/* Toolbar */}
      <div
        data-tour="tour-files-toolbar"
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <Breadcrumbs
          listing={listing}
          onNavigate={p => {
            setQuery("");
            void load(p);
          }}
        />
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56 md:flex-none">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </div>
          {canWrite && (
            <Button
              variant="outline"
              size={isMobile ? "icon" : "default"}
              onClick={() => setNewFolderOpen(true)}
            >
              <FolderPlus className="size-4" />
              {!isMobile && t("newFolder")}
            </Button>
          )}
          {canDrop && (
            <Button
              data-tour="tour-files-upload"
              size={isMobile ? "icon" : "default"}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="size-4" />
              {!isMobile && (canWrite ? t("upload") : t("requestUpload"))}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Listing */}
      <div
        data-tour="tour-files-browser"
        className="rounded-xl border border-border/70 bg-card"
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState searching={results !== null} />
        ) : isMobile ? (
          <ul className="divide-y divide-border/60">
            {items.map(item => (
              <FileCard
                key={item.id}
                item={item}
                onOpen={open}
                onAction={action => onRowAction(action, item)}
              />
            ))}
          </ul>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t("colName")}</th>
                <th className="px-4 py-2.5 font-medium">
                  {t("colUploadedBy")}
                </th>
                <th className="px-4 py-2.5 font-medium">{t("colModified")}</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  {t("colSize")}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <FileRow
                  key={item.id}
                  item={item}
                  onOpen={open}
                  onAction={action => onRowAction(action, item)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        path={path}
        onDone={refresh}
      />
      <RenameDialog
        item={renameItem}
        onOpenChange={() => setRenameItem(null)}
        onDone={refresh}
      />
      <ShareDialog item={shareItem} onOpenChange={() => setShareItem(null)} />
      <VersionsDialog
        item={versionsItem}
        canWrite={canWrite}
        onOpenChange={() => setVersionsItem(null)}
        onDone={refresh}
      />
      <FilePreviewDialog
        item={previewItem}
        onOpenChange={() => setPreviewItem(null)}
      />
    </div>
  );

  type RowAction =
    | "download"
    | "share"
    | "rename"
    | "delete"
    | "versions"
    | "preview";

  function onRowAction(action: RowAction, item: OneDriveItem) {
    switch (action) {
      case "download":
        void od.download(item.id, item.name);
        break;
      case "preview":
        setPreviewItem(item);
        break;
      case "share":
        setShareItem(item);
        break;
      case "rename":
        setRenameItem(item);
        break;
      case "versions":
        setVersionsItem(item);
        break;
      case "delete":
        void onDelete(item);
        break;
    }
  }
}

// --- Sub-components ----------------------------------------------------------

function Breadcrumbs({
  listing,
  onNavigate,
}: {
  listing: OneDriveListing | null;
  onNavigate: (path: string) => void;
}) {
  const crumbs = listing?.breadcrumbs ?? [
    { id: "", name: "Advantis Group", path: "" },
  ];
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <button
            type="button"
            onClick={() => onNavigate(c.path)}
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 hover:bg-accent",
              i === crumbs.length - 1
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

type RowActionType =
  | "download"
  | "share"
  | "rename"
  | "delete"
  | "versions"
  | "preview";

function RowMenu({
  item,
  onAction,
}: {
  item: OneDriveItem;
  onAction: (a: RowActionType) => void;
}) {
  const t = useTranslations("Files");
  const isFile = item.type === "file";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isFile && (
          <DropdownMenuItem onClick={() => onAction("preview")}>
            <FileText className="size-4" />
            {t("preview")}
          </DropdownMenuItem>
        )}
        {isFile && (
          <DropdownMenuItem onClick={() => onAction("download")}>
            <Download className="size-4" />
            {t("download")}
          </DropdownMenuItem>
        )}
        {isFile && (
          <DropdownMenuItem onClick={() => onAction("versions")}>
            <RotateCcw className="size-4" />
            {t("versions")}
          </DropdownMenuItem>
        )}
        {item.canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction("share")}>
              <Link2 className="size-4" />
              {t("share")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("rename")}>
              <Pencil className="size-4" />
              {t("rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction("delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              {t("delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileRow({
  item,
  onOpen,
  onAction,
}: {
  item: OneDriveItem;
  onOpen: (item: OneDriveItem) => void;
  onAction: (a: RowActionType) => void;
}) {
  return (
    <tr className="group border-b border-border/40 last:border-0 hover:bg-accent/40">
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="flex items-center gap-2.5 text-left"
        >
          <ItemIcon item={item} className="size-4 shrink-0" />
          <span className="truncate font-medium">{item.name}</span>
        </button>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {item.uploadedByName ?? "—"}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {item.lastModified
          ? new Date(item.lastModified).toLocaleDateString()
          : "—"}
      </td>
      <td className="px-4 py-2.5 text-right text-muted-foreground">
        {item.type === "file" ? formatFileSize(item.size) : "—"}
      </td>
      <td className="px-2">
        <RowMenu item={item} onAction={onAction} />
      </td>
    </tr>
  );
}

function FileCard({
  item,
  onOpen,
  onAction,
}: {
  item: OneDriveItem;
  onOpen: (item: OneDriveItem) => void;
  onAction: (a: RowActionType) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ItemIcon item={item} className="size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.type === "file" ? formatFileSize(item.size) : ""}
            {item.uploadedByName ? ` · ${item.uploadedByName}` : ""}
          </span>
        </span>
      </button>
      <RowMenu item={item} onAction={onAction} />
    </li>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  const t = useTranslations("Files");
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
      <Folder className="size-8" />
      <p className="text-sm">{searching ? t("noResults") : t("emptyFolder")}</p>
    </div>
  );
}

// Re-export so the page can show a loading fallback without importing internals.
export function FileBrowserSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
