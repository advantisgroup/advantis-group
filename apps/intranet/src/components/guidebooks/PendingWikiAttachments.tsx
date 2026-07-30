"use client";

import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentDropZone } from "@/components/attachments/AttachmentDropZone";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import { type UseAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { MAX_ATTACHMENT_BYTES } from "@/lib/upload";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop file staging for a wiki entry/page that doesn't have a slug
 * yet (still being composed) — OneDrive's wiki-attach endpoint needs one, so
 * these just sit as local files until the caller's create mutation resolves
 * and can flush them via `attachPendingFiles` (lib/wiki-attachments.ts).
 */
export function PendingWikiAttachments({
  attachmentUpload,
  busy,
}: {
  attachmentUpload: UseAttachmentUpload;
  busy?: boolean;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const disabled = !!busy || attachmentUpload.uploading;

  function addFiles(files: File[]) {
    // Each file uploads to OneDrive as its own request (attachPendingFiles),
    // same as the post-create GuidebookAttachments flow — so the cap applies
    // per file, not to the combined batch.
    const rejected = attachmentUpload.addPerFile(files, MAX_ATTACHMENT_BYTES);
    if (rejected.length > 0) toast.error(t("attachTooLarge"));
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("attachmentsTitle")}
      </label>
      <AttachmentDropZone onFiles={addFiles} hint={t("dropHint")} disabled={disabled}>
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <Paperclip className="size-4" />
          {t("attachHint")}
          <input
            type="file"
            multiple
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </AttachmentDropZone>
      <AttachmentList
        entries={attachmentUpload.entries}
        uploading={disabled}
        onRemove={attachmentUpload.remove}
        removeLabel={tc("delete")}
      />
    </div>
  );
}
