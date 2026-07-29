"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/ui/dialog";
import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize, MAX_ATTACHMENT_BYTES } from "@/lib/upload";

/**
 * Admin-uploaded files attached to a hardcoded (registry) guidebook page —
 * the one piece of per-guidebook content that's data-driven, since those
 * pages are otherwise fixed React components. Custom (block-based) pages
 * use an "image" block for this instead.
 */
export function GuidebookAttachments({ slug }: { slug: string }) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const attachments = useQuery(api.guidebookAttachments.list, { slug });
  const addAttachment = useMutation(api.guidebookAttachments.add);
  const removeAttachment = useMutation(api.guidebookAttachments.remove);
  const oneDriveApi = useOneDriveApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!isManager && attachments !== undefined && attachments.length === 0) return null;

  async function onFileSelected(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t("attachTooLarge"));
      return;
    }
    setBusy(true);
    try {
      const uploaded = await oneDriveApi.attachToWiki(slug, file);
      await addAttachment({ slug, attachment: uploaded });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(attachment: NonNullable<typeof attachments>[number]) {
    const ok = await confirm({
      title: t("deleteAttachmentConfirm"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      // Authorize + drop the reference first — only delete the actual
      // OneDrive file once that's confirmed, so a rejected or failed call
      // never leaves a live file with its reference already gone (or a
      // dangling reference to a file someone else just deleted).
      const result = await removeAttachment({ attachmentId: attachment._id });
      if (result.oneDriveItemId) {
        await oneDriveApi.remove(result.oneDriveItemId).catch((e) => {
          console.error("[guidebook-attachments] OneDrive cleanup failed:", e);
        });
      }
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="mt-6 space-y-2 border-t border-border/60 pt-6 print:hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("attachmentsTitle")}
        </p>
        {isManager && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFileSelected(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="mr-1.5 size-3.5" />
              {t("addAttachment")}
            </Button>
          </>
        )}
      </div>
      {attachments === undefined ? null : attachments.length === 0 ? (
        isManager ? (
          <p className="text-xs text-muted-foreground">{t("noAttachments")}</p>
        ) : null
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a._id}
              className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <FileText className="size-4" />
              </span>
              <button
                type="button"
                onClick={() =>
                  void (a.oneDriveItemId
                    ? oneDriveApi.download(a.oneDriveItemId, a.name)
                    : a.legacyUrl && window.open(a.legacyUrl, "_blank"))
                }
                className="min-w-0 text-left"
              >
                <span className="block max-w-[14rem] truncate font-medium">{a.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.size != null ? formatFileSize(a.size) : ""}
                </span>
              </button>
              <Download className="size-3.5 shrink-0 text-muted-foreground" />
              {isManager && (
                <button
                  type="button"
                  onClick={() => void onDelete(a)}
                  aria-label={tc("delete")}
                  className="ml-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
