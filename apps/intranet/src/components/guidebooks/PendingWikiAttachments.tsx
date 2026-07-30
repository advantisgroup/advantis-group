"use client";

import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentDropZone } from "@/components/attachments/AttachmentDropZone";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import { type UseAttachmentUpload } from "@/components/attachments/useAttachmentUpload";

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

  function addFiles(files: File[]) {
    if (!attachmentUpload.add(files)) toast.error(t("attachTooLarge"));
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("attachmentsTitle")}
      </label>
      <AttachmentDropZone onFiles={addFiles} hint={t("dropHint")}>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <Paperclip className="size-4" />
          {t("attachHint")}
          <input
            type="file"
            multiple
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
        uploading={!!busy || attachmentUpload.uploading}
        onRemove={attachmentUpload.remove}
        removeLabel={tc("delete")}
      />
    </div>
  );
}
