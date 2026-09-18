"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type DriveQuota, type OneDriveItem, type OneDriveListing } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Clock,
  Download,
  Folder,
  FolderPlus,
  Frown,
  LayoutGrid,
  Loader2,
  NotebookPen,
  Rows3,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { nextSort, type Sort, sortSign } from "@/components/ui/sortable-head";
import { useIsMobile } from "@/hooks/use-mobile";
import { shouldEagerPrefetch } from "@/lib/network-heuristics";
import { useOneDriveApi } from "@/lib/onedrive-api";
import {
  getCachedConfigured,
  getCachedListing,
  getCachedQuota,
  invalidateListingCache,
  isListingFresh,
  isQuotaFresh,
  setCachedConfigured,
  setCachedListing,
  setCachedQuota,
} from "@/lib/onedrive-cache";
import { pathToUrl } from "@/lib/onedrive-path";
import { cn } from "@/lib/utils";

import { NewFolderDialog, RenameDialog, ShareDialog, VersionsDialog } from "./FileDialogs";
import { FilePreviewDialog } from "./FilePreviewDialog";
import { UploadDropOverlay } from "./UploadDropOverlay";
import {
  Breadcrumbs,
  EmptyState,
  FileCard,
  FileRow,
  GridTile,
  QuotaBar,
  type RowActionType,
  SortHeader,
} from "./FileBrowserParts";

/** localStorage key for dismissing the root-level "new docs go in the wiki
 * now" notice — cosmetic and per-device, so it doesn't need a userPreferences
 * round trip. */
const WIKI_NOTICE_KEY = "files-wiki-notice-dismissed";

type SortKey = "name" | "modified" | "size";
type ViewMode = "list" | "grid";
const VIEW_KEY = "files:view";

interface QueueEntry {
  id: number;
  file: File;
  status: "pending" | "uploading" | "finalizing" | "done" | "error";
  progress: number;
}

export function FileBrowser({
  initialPath = "",
  rootPath = "",
  rootLabel,
  routeBase = "/files",
}: {
  initialPath?: string;
  /** Confines this browser to a subtree — used by the dedicated Wiki/HR
   * explorer views. Purely a UX affordance (hiding the breadcrumb segments
   * above it, replacing "Advantis Group" with `rootLabel`, and refusing to
   * navigate above it); the server independently enforces the same
   * boundary for anyone who only holds the wiki/HR indirect grant (see
   * apps/api's `assertWithinBrowsableScope`), so this never has to be
   * trusted as the real security boundary. */
  rootPath?: string;
  rootLabel?: string;
  /** The route this instance is mounted at — navigation stays under it
   * instead of always redirecting to `/files`. */
  routeBase?: string;
}) {
  const t = useTranslations("Files");
  const tc = useTranslations("Common");
  const od = useOneDriveApi();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const router = useRouter();

  const [wikiNoticeDismissed, setWikiNoticeDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(WIKI_NOTICE_KEY) === "1",
  );
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [path, setPath] = useState(initialPath);
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

  const [view, setView] = useState<ViewMode>("list");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "name", dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState(-1);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const queueIdRef = useRef(0);

  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const myUploads = useQuery(api.onedrive.myUploads);
  const favoriteFolders = useMemo(() => prefs?.favoriteFolders ?? [], [prefs]);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === "grid" || stored === "list") setView(stored);
  }, []);
  const changeView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetches a folder's contents. The URL is expected to already point at
  // `next` (navigate() below updates it up front); this only corrects the
  // URL if the server resolves the path differently than requested.
  //
  // Stale-while-revalidate: a folder visited in the last 45s is shown
  // instantly from the in-memory cache with no network call at all — a
  // drive change landing in that exact window is rare enough not to matter.
  // Older cached data is still shown immediately (no skeleton flash) while a
  // background refetch quietly brings it up to date.
  const load = useCallback(
    async (next: string) => {
      const cached = getCachedListing(next);
      if (cached) {
        setListing(cached);
        setPath(cached.path);
        setLoading(false);
        // A deep link to a file (e.g. a chat/announcement attachment) lists
        // its parent folder and flags the file to preview.
        if (cached.previewItem) setPreviewItem(cached.previewItem);
        if (isListingFresh(next)) return;
      } else {
        setLoading(true);
      }
      try {
        const data = await od.list(next);
        setListing(data);
        setPath(data.path);
        setCachedListing(next, data);
        if (data.previewItem) setPreviewItem(data.previewItem);
        const url = pathToUrl(data.path, routeBase, rootPath);
        if (url !== pathToUrl(next, routeBase, rootPath)) {
          router.replace(url);
        }
      } catch (e) {
        if (!cached) toast.error(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
      }
    },
    [od, t, router, routeBase, rootPath],
  );

  // Pushes the target folder into the URL immediately; the effect below
  // (reacting to the resulting `initialPath` change) does the actual fetch.
  // This keeps navigation to a single load instead of loading the old
  // folder first and only updating the URL once that fetch finishes.
  // Confined instances refuse to navigate above their own root.
  const navigate = useCallback(
    (next: string) => {
      if (rootPath && next !== rootPath && !next.startsWith(`${rootPath}/`)) return;
      router.push(pathToUrl(next, routeBase, rootPath));
    },
    [router, routeBase, rootPath],
  );

  // Resolve whether OneDrive is configured before firing any Graph-backed
  // calls. `configured` essentially never flips mid-session, so apply any
  // cached value optimistically first — that unblocks the listing/quota
  // effects below on this same tick instead of waiting on a fresh status()
  // round trip on every mount. The real status() call still runs in the
  // background to correct the cache if the tenant config actually changed.
  useEffect(() => {
    const cached = getCachedConfigured();
    if (cached !== undefined) setConfigured(cached);
    void od
      .status()
      .then((s) => {
        setConfigured(s.configured);
        setCachedConfigured(s.configured);
      })
      .catch(() => {
        if (cached === undefined) setConfigured(false);
      });
  }, [od]);

  // Single source of truth for fetching: fires on mount and whenever the
  // URL's path changes (navigate() above, or browser back/forward).
  useEffect(() => {
    if (configured !== true) return;
    void load(initialPath);
  }, [configured, initialPath, load]);

  useEffect(() => {
    if (configured !== true) return;
    const cached = getCachedQuota();
    if (cached) setQuota(cached);
    if (cached && isQuotaFresh()) return;
    void od
      .quota()
      .then((q) => {
        setQuota(q);
        setCachedQuota(q);
      })
      .catch(() => {
        if (!cached) setQuota(null);
      });
  }, [configured, od]);

  // Any write invalidates the client cache too — the server's cache is
  // already bumped by the mutation, so the next load() should hit the network.
  const refresh = useCallback(() => {
    invalidateListingCache();
    void load(path);
  }, [load, path]);

  // Speculative fetch on hover/focus intent — warms the cache for a folder
  // before the user actually clicks it, without touching any visible state
  // (unlike load(), which drives what's on screen). On capable connections/
  // devices it also warms one level of nested subfolders, since a hover
  // usually precedes drilling further in.
  const prefetch = useCallback(
    (target: string) => {
      if (isListingFresh(target)) return;
      void od
        .list(target)
        .then((data) => {
          setCachedListing(target, data);
          if (!shouldEagerPrefetch()) return;
          for (const item of data.items) {
            if (item.type === "folder" && !isListingFresh(item.path)) {
              void od
                .list(item.path)
                .then((nested) => setCachedListing(item.path, nested))
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    },
    [od],
  );

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
        .then((r) => setResults(r.items))
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
          await od.upload(files[i], path, (f) => onProgress((i + f) / total));
        }
        refresh();
        toast.success(
          listing.canWrite
            ? t("uploadedCount", { count: total })
            : t("requestedCount", { count: total }),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("genericError"));
        throw e;
      }
    },
    [listing, od, path, refresh, t],
  );

  /** One queue entry at a time; failures stay in the panel with a retry. */
  const runQueueEntry = useCallback(
    async (entry: QueueEntry, targetPath: string) => {
      const patch = (p: Partial<QueueEntry>) =>
        setQueue((q) => q.map((e) => (e.id === entry.id ? { ...e, ...p } : e)));
      patch({ status: "uploading", progress: 0 });
      try {
        // The client→server transfer can hit 100% well before the server's
        // scan + Graph upload + Convex record finish — show "Finalizing…"
        // for that gap instead of leaving the bar looking stuck at 100%.
        await od.upload(entry.file, targetPath, (f) =>
          patch({ progress: f, status: f >= 1 ? "finalizing" : "uploading" }),
        );
        patch({ status: "done", progress: 1 });
        refresh();
      } catch {
        patch({ status: "error" });
      }
    },
    [od, refresh],
  );

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const entries: QueueEntry[] = files.map((file) => ({
        id: ++queueIdRef.current,
        file,
        status: "pending",
        progress: 0,
      }));
      setQueue((q) => [...q, ...entries]);
      void (async () => {
        for (const entry of entries) {
          await runQueueEntry(entry, path);
        }
      })();
    },
    [path, runQueueEntry],
  );

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    enqueueFiles(Array.from(files));
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
      navigate(item.path);
    } else {
      setPreviewItem(item);
    }
  };

  const items = useMemo(() => {
    const rawItems = results ?? listing?.items ?? [];
    const compare = (a: OneDriveItem, b: OneDriveItem) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      let cmp = 0;
      if (sort.key === "modified") cmp = (a.lastModified ?? "").localeCompare(b.lastModified ?? "");
      else if (sort.key === "size") cmp = a.size - b.size;
      else cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      return cmp * sortSign(sort.dir);
    };
    return [...rawItems].sort(compare);
  }, [results, listing, sort]);
  const canWrite = listing?.canWrite ?? false;
  const canDrop = Boolean(listing && (listing.canWrite || listing.canRequest));

  function toggleSort(key: SortKey) {
    setSort((s) => nextSort(s, key));
  }

  // Selection and keyboard focus reset whenever the visible set changes.
  useEffect(() => {
    setSelected(new Set());
    setFocusIdx(-1);
  }, [path, results]);

  // Keyboard navigation (desktop): ↑/↓ move, Enter opens, Backspace goes up.
  useEffect(() => {
    if (isMobile) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (previewItem || renameItem || shareItem || versionsItem || newFolderOpen) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && focusIdx >= 0 && items[focusIdx]) {
        e.preventDefault();
        open(items[focusIdx]);
      } else if (e.key === "Backspace" && path) {
        e.preventDefault();
        navigate(path.split("/").slice(0, -1).join("/"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMobile,
    items,
    focusIdx,
    path,
    previewItem,
    renameItem,
    shareItem,
    versionsItem,
    newFolderOpen,
    navigate,
  ]);

  const isFavorite = (p: string) => favoriteFolders.includes(p);
  function toggleFavorite(item: OneDriveItem) {
    const next = isFavorite(item.path)
      ? favoriteFolders.filter((f) => f !== item.path)
      : [...favoriteFolders, item.path];
    void setPrefs({ favoriteFolders: next });
  }

  function copyLink(item: OneDriveItem) {
    void navigator.clipboard.writeText(
      `${window.location.origin}${pathToUrl(item.path, routeBase, rootPath)}`,
    );
    toast.success(t("linkCopied"));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((i) => selected.has(i.id));

  async function bulkDownload() {
    for (const item of selectedItems.filter((i) => i.type === "file")) {
      await od.download(item.id, item.name);
    }
    setSelected(new Set());
  }

  async function bulkDelete() {
    const deletable = selectedItems.filter((i) => i.canWrite);
    if (deletable.length === 0) return;
    const ok = await confirm({
      title: t("bulkDeleteTitle", { count: deletable.length }),
      description: t("deleteDesc"),
      // A bare count is the one thing that can't be sanity-checked; name them.
      details: deletable.slice(0, 6).map((i) => ({ label: tc("fieldName"), value: i.name })),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      for (const item of deletable) {
        await od.remove(item.id);
      }
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    }
    setSelected(new Set());
    refresh();
  }

  // "Recent uploads" only makes sense at the drive root without an active
  // search — deeper in it would just repeat the folder contents.
  const recentUploads =
    path === "" && results === null
      ? (myUploads ?? []).filter((u) => u.status === "approved" && u.driveItemId).slice(0, 5)
      : [];

  // OneDrive credentials aren't set — dim the whole tab with a plain-text notice.
  if (configured === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center opacity-60">
        <Frown className="size-10 text-muted-foreground" />
        <p className="font-medium">{t("notConfiguredTitle")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{t("notConfiguredBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canDrop && (
        <UploadDropOverlay enabled={canDrop} requiresApproval={!canWrite} onUpload={handleUpload} />
      )}

      {/* Header: title + quota */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold md:text-xl">{t("title")}</h1>
        {quota && <QuotaBar quota={quota} />}
      </div>

      {path === "" && !wikiNoticeDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 refreshed:border-border/70 refreshed:bg-card">
          <NotebookPen className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{t("wikiNoticeTitle")}</p>
            <p className="mt-0.5 text-muted-foreground">{t("wikiNoticeBody")}</p>
            <Link
              href="/guidebooks"
              className="mt-1.5 inline-block font-medium text-primary hover:underline"
            >
              {t("wikiNoticeCta")}
            </Link>
          </div>
          <button
            type="button"
            aria-label={t("wikiNoticeDismiss")}
            onClick={() => {
              localStorage.setItem(WIKI_NOTICE_KEY, "1");
              setWikiNoticeDismissed(true);
            }}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div
        data-tour="tour-files-toolbar"
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <Breadcrumbs
          listing={listing}
          rootPath={rootPath}
          rootLabel={rootLabel}
          onNavigate={(p) => {
            setQuery("");
            navigate(p);
          }}
        />
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56 md:flex-none">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </div>
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("viewList")}
              aria-pressed={view === "list"}
              className={cn(view === "list" && "bg-accent text-foreground")}
              onClick={() => changeView("list")}
            >
              <Rows3 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("viewGrid")}
              aria-pressed={view === "grid"}
              className={cn(view === "grid" && "bg-accent text-foreground")}
              onClick={() => changeView("grid")}
            >
              <LayoutGrid className="size-4" />
            </Button>
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
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Quick access: pinned folders + recent uploads (root only) */}
      {results === null && (favoriteFolders.length > 0 || recentUploads.length > 0) && (
        <div className="space-y-2">
          {favoriteFolders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Star className="size-3.5 text-amber-500" />
              {favoriteFolders.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => navigate(f)}
                  onMouseEnter={() => prefetch(f)}
                  onFocus={() => prefetch(f)}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Folder className="size-3 text-blue-500" />
                  {f.split("/").pop() || t("title")}
                </button>
              ))}
            </div>
          )}
          {recentUploads.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              {recentUploads.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  title={u.targetFolderPath || "/"}
                  onClick={() => navigate(u.targetFolderPath)}
                  onMouseEnter={() => prefetch(u.targetFolderPath)}
                  onFocus={() => prefetch(u.targetFolderPath)}
                  className="max-w-52 truncate rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {u.fileName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">
            {t("selectedCount", { count: selected.size })}
          </span>
          {selectedItems.some((i) => i.type === "file") && (
            <Button variant="outline" size="sm" onClick={() => void bulkDownload()}>
              <Download className="size-3.5" />
              {t("download")}
            </Button>
          )}
          {selectedItems.some((i) => i.canWrite) && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void bulkDelete()}
            >
              <Trash2 className="size-3.5" />
              {t("delete")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            <X className="size-3.5" />
            {t("clearSelection")}
          </Button>
        </div>
      )}

      {/* Listing */}
      <div data-tour="tour-files-browser" className="rounded-xl border border-border/70 bg-card">
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
            {items.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                highlightQuery={results !== null ? query.trim() : ""}
                onOpen={open}
                onAction={(action) => onRowAction(action, item)}
              />
            ))}
          </ul>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item, idx) => (
              <GridTile
                key={item.id}
                item={item}
                focused={idx === focusIdx}
                favorite={item.type === "folder" && isFavorite(item.path)}
                onOpen={open}
                onAction={(action) => onRowAction(action, item)}
                onHoverIntent={(i) => i.type === "folder" && prefetch(i.path)}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground refreshed:bg-muted/40 refreshed:normal-case refreshed:tracking-normal">
                <th className="w-8 pl-3">
                  <Checkbox
                    aria-label={t("selectAll")}
                    checked={selected.size > 0 && selected.size === items.length}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? new Set(items.map((i) => i.id)) : new Set())
                    }
                  />
                </th>
                <SortHeader
                  label={t("colName")}
                  active={sort.key === "name"}
                  dir={sort.dir}
                  onClick={() => toggleSort("name")}
                />
                <th className="px-4 py-2.5 font-medium">{t("colUploadedBy")}</th>
                <SortHeader
                  label={t("colModified")}
                  active={sort.key === "modified"}
                  dir={sort.dir}
                  onClick={() => toggleSort("modified")}
                />
                <SortHeader
                  label={t("colSize")}
                  active={sort.key === "size"}
                  dir={sort.dir}
                  onClick={() => toggleSort("size")}
                  align="right"
                />
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <FileRow
                  key={item.id}
                  item={item}
                  highlightQuery={results !== null ? query.trim() : ""}
                  focused={idx === focusIdx}
                  selected={selected.has(item.id)}
                  onSelect={() => toggleSelected(item.id)}
                  favorite={item.type === "folder" && isFavorite(item.path)}
                  onOpen={open}
                  onAction={(action) => onRowAction(action, item)}
                  onHoverIntent={(i) => i.type === "folder" && prefetch(i.path)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload queue panel */}
      {queue.length > 0 && (
        <div className="fixed bottom-20 right-4 z-40 w-72 rounded-xl border border-border bg-card p-3 shadow-lg md:bottom-4 refreshed:shadow-overlay">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
              {t("uploadQueue")}
            </p>
            {queue.every((e) => e.status === "done" || e.status === "error") && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("cancel")}
                onClick={() => setQueue([])}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {queue.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs">
                {entry.status === "done" ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                ) : entry.status === "error" ? (
                  <XCircle className="size-3.5 shrink-0 text-destructive" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                {entry.status === "uploading" && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(entry.progress * 100)}%
                  </span>
                )}
                {entry.status === "finalizing" && (
                  <span className="shrink-0 text-muted-foreground">{t("finalizing")}</span>
                )}
                {entry.status === "error" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => void runQueueEntry(entry, path)}
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        path={path}
        onDone={refresh}
      />
      <RenameDialog item={renameItem} onOpenChange={() => setRenameItem(null)} onDone={refresh} />
      <ShareDialog item={shareItem} onOpenChange={() => setShareItem(null)} />
      <VersionsDialog
        item={versionsItem}
        canWrite={canWrite}
        onOpenChange={() => setVersionsItem(null)}
        onDone={refresh}
      />
      <FilePreviewDialog item={previewItem} onOpenChange={() => setPreviewItem(null)} />
    </div>
  );

  function onRowAction(action: RowActionType, item: OneDriveItem) {
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
      case "copylink":
        copyLink(item);
        break;
      case "favorite":
        toggleFavorite(item);
        break;
    }
  }
}
