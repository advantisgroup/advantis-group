"use client";

import type { api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { ExternalLink, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { pathToUrl } from "@/lib/onedrive-path";

type Message = FunctionReturnType<typeof api.chat.getMessages>["page"][number];

/** A message's files and link cards, under its text. */
export function MessageAttachments({
  message,
}: {
  message: Pick<Message, "attachments" | "linkPreviews" | "createdAt">;
}) {
  const tc = useTranslations("Common");
  const { openFileViewer } = useFileViewer();

  function view(a: Message["attachments"][number]) {
    openFileViewer({
      storageId: a.storageId,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
      modifiedAt: message.createdAt,
      url: a.url ?? undefined,
    });
  }

  return (
    <>
      {message.attachments.map((a) => {
        const fromOneDrive = Boolean(a.oneDrivePath);
        if (a.kind === "image" && a.url) {
          return (
            <button
              type="button"
              key={a.storageId}
              onClick={() =>
                fromOneDrive ? (window.location.href = pathToUrl(a.oneDrivePath!)) : view(a)
              }
              className="relative mt-1 block"
            >
              <img src={a.url} alt={a.name} className="max-h-64 rounded-lg" />
              {fromOneDrive && (
                <span
                  title={tc("fromOneDrive")}
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-background/90 shadow ring-1 ring-border"
                >
                  <Mark provider="onedrive" className="size-3.5" />
                </span>
              )}
            </button>
          );
        }
        if (!a.url) return null;
        if (fromOneDrive) {
          return (
            <a
              key={a.storageId}
              href={pathToUrl(a.oneDrivePath!)}
              className="mt-1 flex items-center gap-1 underline"
            >
              <Mark provider="onedrive" className="size-3" />
              {a.name}
              <ExternalLink className="h-3 w-3 text-blue-500" />
            </a>
          );
        }
        return (
          <button
            type="button"
            key={a.storageId}
            onClick={() => view(a)}
            className="mt-1 flex items-center gap-1 text-left underline"
          >
            <Paperclip className="h-3 w-3" />
            {a.name}
          </button>
        );
      })}
      {message.linkPreviews.map((lp) => (
        <a
          key={lp.url}
          href={lp.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block overflow-hidden rounded-lg border bg-background text-foreground"
        >
          {lp.image && <img src={lp.image} alt="" className="h-28 w-full object-cover" />}
          <span className="block p-2">
            <span className="block text-xs font-semibold">{lp.title}</span>
            {lp.description && (
              <span className="line-clamp-2 text-xs text-muted-foreground">{lp.description}</span>
            )}
          </span>
        </a>
      ))}
    </>
  );
}
