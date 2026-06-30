"use client";

import { useEffect, useState } from "react";

import { type OneDriveItem } from "@advantis/types";
import { Download, FileQuestion, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOneDriveApi } from "@/lib/onedrive-api";

/**
 * Inline preview for a single drive item. Images and PDFs render via the
 * short-lived Graph preview URL; everything else offers a download. The preview
 * URL is fetched per-open so it never goes stale.
 */
export function FilePreviewDialog({
  item,
  onOpenChange,
}: {
  item: OneDriveItem | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("Files");
  const od = useOneDriveApi();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isImage = item?.mimeType?.startsWith("image/") ?? false;

  useEffect(() => {
    if (!item) return;
    // Reset when the previewed item changes, then fetch its fresh URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null);
     
    setLoading(true);
    void od
      .preview(item.id)
      .then(r => {
        setUrl(
          isImage
            ? (r.thumbnailUrl ?? r.previewUrl ?? null)
            : (r.previewUrl ?? null)
        );
      })
      .catch(() => setUrl(null))
      .finally(() => setLoading(false));
  }, [item, od, isImage]);

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{item?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[50vh] items-center justify-center overflow-hidden rounded-lg bg-muted/40">
          {loading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : url && isImage ? (
            <img
              src={url}
              alt={item?.name ?? ""}
              className="max-h-[70vh] w-auto object-contain"
            />
          ) : url ? (
            <iframe
              src={url}
              title={item?.name ?? "preview"}
              className="h-[70vh] w-full"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileQuestion className="size-10" />
              <p className="text-sm">{t("noPreview")}</p>
              {item && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void od.download(item.id, item.name)}
                >
                  <Download className="size-4" />
                  {t("download")}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
