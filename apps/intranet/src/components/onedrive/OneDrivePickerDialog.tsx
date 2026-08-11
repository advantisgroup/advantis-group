"use client";

import { useCallback, useEffect, useState } from "react";

import { type MessageAttachment, type OneDriveItem, type OneDriveListing } from "@advantis/types";
import { ChevronRight, Frown, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { HighlightMatch, ItemIcon } from "./FileBrowser";

/**
 * Drop-in "attach from OneDrive" dialog. Browses/searches the same drive as
 * the Files tab (respecting the same read access rules), then hands the
 * caller a plain `File` for the chosen item — so any feature that already
 * accepts local uploads (announcements, chat, …) can add a OneDrive source
 * with a single `onSelect` callback and no attachment-model changes.
 */
export function OneDrivePickerDialog({
  open,
  onOpenChange,
  onSelect,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `item` is the OneDrive source — keep it to record where the file came from. */
  onSelect?: (file: File, item: OneDriveItem) => void;
  /**
   * Alternative to `onSelect`: import the file directly into Convex storage
   * server-side (Graph -> API -> Convex) instead of downloading it into the
   * browser first, for callers that just need a ready-to-attach payload
   * (e.g. chat). Takes precedence over `onSelect` when both are given.
   */
  onImport?: (attachment: MessageAttachment, item: OneDriveItem) => void;
}) {
  const t = useTranslations("Files");
  const od = useOneDriveApi();

  const [listing, setListing] = useState<OneDriveListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OneDriveItem[] | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const load = useCallback(
    async (next: string) => {
      setLoading(true);
      try {
        const data = await od.list(next);
        setListing(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
      }
    },
    [od, t],
  );

  // Start fresh at the root every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    void load("");
  }, [open, load]);

  // Debounced search, scoped to this dialog instance only.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
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

  const items = results ?? listing?.items ?? [];
  const crumbs = listing?.breadcrumbs ?? [{ id: "", name: "Advantis GmbH", path: "" }];
  const searching = results !== null;

  async function activate(item: OneDriveItem) {
    if (item.type === "folder") {
      setQuery("");
      void load(item.path);
      return;
    }
    setImportingId(item.id);
    try {
      if (onImport) {
        const attachment = await od.importAttachment(item);
        onImport(attachment, item);
      } else {
        const file = await od.downloadAsFile(item);
        onSelect?.(file, item);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setImportingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pickerTitle")}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>

        {!searching && (
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
                <button
                  type="button"
                  onClick={() => void load(c.path)}
                  className={cn(
                    "shrink-0 rounded px-1 py-0.5 hover:bg-accent",
                    i === crumbs.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border/60">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Frown className="size-6" />
              <p className="text-sm">{searching ? t("noResults") : t("emptyFolder")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void activate(item)}
                    disabled={importingId !== null}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40 disabled:opacity-50"
                  >
                    <ItemIcon item={item} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <HighlightMatch text={item.name} query={searching ? query.trim() : ""} />
                    </span>
                    {item.type === "file" && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(item.size)}
                      </span>
                    )}
                    {importingId === item.id && (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
