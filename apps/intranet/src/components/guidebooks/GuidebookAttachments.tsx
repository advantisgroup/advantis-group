"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/ui/dialog";
import { useHasCapability } from "@/components/providers/current-user";
import { AttachmentDropZone } from "@/components/attachments/AttachmentDropZone";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import { OneDriveFolderPicker } from "@/components/attachments/OneDriveFolderPicker";
import { AttachmentThumb } from "@/components/guidebooks/AttachmentThumb";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";
import { formatFileSize, MAX_ATTACHMENT_BYTES } from "@/lib/upload";

/**
 * Files attached to a hardcoded (registry) guidebook page — the one piece
 * of per-guidebook content that's data-driven, since those pages are
 * otherwise fixed React components. Custom (block-based) pages use an
 * "image" block for this instead. Gated by `manage_guidebooks` (not just
 * manager rank) — the same capability that grants the indirect Team/Wiki
 * OneDrive write permission server-side (see apps/api's access.ts).
 */
export function GuidebookAttachments({ slug }: { slug: string }) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const canManage = useHasCapability("manage_guidebooks");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const attachments = useQuery(api.guidebooks.attachments.list, { slug });
  const addAttachment = useMutation(api.guidebooks.attachments.add);
  const removeAttachment = useMutation(api.guidebooks.attachments.remove);
  const oneDriveApi = useOneDriveApi();
  const { openFileViewer } = useFileViewer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [inFlight, setInFlight] = useState<{ file: File; progress: number }[]>([]);
  const [folder, setFolder] = useState("");

  if (!canManage && attachments !== undefined && attachments.length === 0) return null;

  function setFileProgress(file: File, progress: number) {
    setInFlight((prev) => prev.map((f) => (f.file === file ? { ...f, progress } : f)));
  }

  const destinationPath = `${WIKI_FOLDER_BASE}/${slug}${folder ? `/${folder}` : ""}`;

  async function onFilesSelected(files: File[]) {
    const valid = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (valid.length < files.length) toast.error(t("attachTooLarge"));
    if (valid.length === 0) return;
    setBusy(true);
    setInFlight(valid.map((file) => ({ file, progress: 0 })));
    try {
      // allSettled (not all) — one failing file must not clear the shared
      // busy/inFlight state while its siblings' XHRs are still in flight.
      const results = await Promise.allSettled(
        valid.map(async (file) => {
          const uploaded = await oneDriveApi.attachToWiki(
            slug,
            file,
            (fraction) => setFileProgress(file, fraction),
            folder || undefined,
          );
          await addAttachment({ slug, attachment: uploaded });
          setInFlight((prev) => prev.filter((f) => f.file !== file));
        }),
      );
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) handleError(failed.reason);
      else toast.success(t("uploadedTo", { path: destinationPath }));
    } finally {
      setBusy(false);
      setInFlight([]);
    }
  }

  async function onDelete(attachment: NonNullable<typeof attachments>[number]) {
    const ok = await confirm({
      title: t("deleteAttachmentConfirm"),
      description: tc("deleteWarning"),
      details: [{ label: tc("fieldName"), value: attachment.name }],
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
    <AttachmentDropZone
      onFiles={(files) => void onFilesSelected(files)}
      hint={t("dropHint")}
      disabled={!canManage || busy}
      className="mt-6 space-y-2 rounded-lg border-t border-border/60 pt-6 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground font-medium normal-case tracking-normal">
          {t("attachmentsTitle")}
        </p>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <OneDriveFolderPicker
              basePath={`${WIKI_FOLDER_BASE}/${slug}`}
              value={folder}
              onChange={setFolder}
            />
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void onFilesSelected(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            {/* The storage path is editor plumbing, not something a reader
                needs at the top of the attachments — it hangs off the upload
                button it describes instead of taking its own line. */}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              title={t("savingTo", { path: destinationPath })}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="mr-1.5 size-3.5" />
              {t("addAttachment")}
            </Button>
          </div>
        )}
      </div>
      {inFlight.length > 0 && (
        <AttachmentList
          entries={inFlight}
          uploading
          onRemove={() => {}}
          removeLabel={tc("delete")}
        />
      )}
      {attachments === undefined ? null : attachments.length === 0 ? (
        canManage ? (
          <p className="text-xs text-muted-foreground">{t("noAttachments")}</p>
        ) : null
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {attachments.map((a) => (
            <div
              key={a._id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20 hover:shadow-none"
            >
              <button
                type="button"
                onClick={() =>
                  openFileViewer({
                    // `a._id` is this attachment row's own id, not a
                    // Convex storage id — never pass it as `storageId`
                    // (GlobalFileViewer would try to resolve it via
                    // files.getUrl and fail validation). OneDrive-backed
                    // rows carry `oneDriveItemId` instead; legacy rows
                    // already resolve their own `url` server-side.
                    oneDriveItemId: a.oneDriveItemId ?? undefined,
                    name: a.name,
                    contentType: a.contentType ?? undefined,
                    size: a.size ?? undefined,
                    modifiedAt: a.createdAt,
                    url: a.legacyUrl ?? undefined,
                  })
                }
                className="block w-full text-left"
              >
                <AttachmentThumb attachment={a} className="aspect-square w-full" />
                <span className="block truncate px-2.5 pt-2 text-xs font-medium">{a.name}</span>
                <span className="block px-2.5 pb-2.5 text-[11px] text-muted-foreground">
                  {a.size != null ? formatFileSize(a.size) : ""}
                </span>
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => void onDelete(a)}
                  aria-label={tc("delete")}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur transition-opacity hover:bg-destructive md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AttachmentDropZone>
  );
}
