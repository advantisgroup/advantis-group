"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MentionRichText } from "@/components/profile/MentionRichText";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

/**
 * New announcements pop up one after another until each is confirmed with
 * "Gelesen und verstanden" — the confirmation counts as read and as the read
 * receipt the author sees. Waits while `paused` (another prompt is open).
 * Mounted in the app shell so it appears wherever the person lands.
 */
export function AnnouncementPopup({ paused = false }: { paused?: boolean }) {
  const t = useTranslations("Announcements.popup");
  const locale = useLocale();
  const queue = useQuery(api.announcements.popupQueue);
  const confirm = useMutation(api.announcements.confirmPopup);
  const handleError = useErrorHandler();
  const [busy, setBusy] = useState(false);

  const current = queue?.[0];
  if (!current) return null;

  async function onConfirm() {
    if (!current) return;
    setBusy(true);
    try {
      await confirm({ announcementId: current._id });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  const remaining = queue.length - 1;

  return (
    <ResponsiveDialog
      open={!paused}
      // Only the button below closes it.
      onOpenChange={() => {}}
      locked
      contentClassName="max-w-xl"
      title={current.title}
      description={[
        current.authorName,
        formatDateTime(current.publishedAt, locale),
        remaining > 0 ? t("more", { count: remaining }) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      footer={
        <Button onClick={() => void onConfirm()} disabled={busy} className="w-full sm:w-auto">
          {t("confirm")}
        </Button>
      }
    >
      <MentionRichText html={current.body} sourcedDateSummary={current.title} />
      {current.attachmentCount > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Paperclip className="size-4 shrink-0" />
          {t("attachments", { count: current.attachmentCount })}
        </p>
      )}
    </ResponsiveDialog>
  );
}
