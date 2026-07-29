"use client";

import { FileText, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { MentionRichText } from "@/components/profile/MentionRichText";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateTime, initials } from "@/lib/format";
import { formatFileSize } from "@/lib/upload";

interface PreviewFile {
  file: File;
  url: string | null;
}

/**
 * Read-only rendering of how a draft will look to readers — reused by the
 * composer's desktop split pane and the mobile "Preview" toggle, so both
 * stay pixel-identical to what actually publishes.
 */
export function AnnouncementPreview({
  title,
  body,
  pinned,
  authorName,
  authorAvatar,
  locale,
  previews,
}: {
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  authorAvatar?: string | null;
  locale: string;
  previews: PreviewFile[];
}) {
  const t = useTranslations("Announcements");

  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <header className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
        <Avatar className="h-9 w-9">
          {authorAvatar && <AvatarImage src={authorAvatar} alt={authorName} />}
          <AvatarFallback className="text-xs">{initials(authorName, "")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {pinned && <Pin className="size-3.5 text-primary" />}
            <p className="truncate font-semibold">{title.trim() || t("titlePlaceholder")}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {authorName} · {formatDateTime(Date.now(), locale)}
          </p>
        </div>
      </header>
      <div className="px-5 py-4">
        <MentionRichText html={body} />
        {previews.length > 0 && (
          <div className="mt-4 space-y-3">
            {previews.some((p) => p.url) && (
              <div className="flex flex-wrap gap-2">
                {previews
                  .filter((p) => p.url)
                  .map((p) => (
                    <img
                      key={p.file.name}
                      src={p.url ?? ""}
                      alt={p.file.name}
                      className="max-h-60 w-auto max-w-full rounded-lg border border-border object-cover"
                    />
                  ))}
              </div>
            )}
            {previews.some((p) => !p.url) && (
              <div className="flex flex-wrap gap-2">
                {previews
                  .filter((p) => !p.url)
                  .map((p) => (
                    <span
                      key={p.file.name}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[14rem] truncate text-sm font-medium">
                          {p.file.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatFileSize(p.file.size)}
                        </span>
                      </span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
