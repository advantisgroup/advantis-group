"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  Copy,
  Download,
  FileQuestion,
  Info,
  Loader2,
  MoreVertical,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/upload";

import { detectFileKind, type FileKind } from "./file-kind";

import type { ViewableFile } from "./FileViewerProvider";

async function downloadUrl(url: string, name: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fetch/blob can fail (CORS, network) — opening the raw URL is still a
    // usable fallback, even if it doesn't force a download.
    window.open(url, "_blank");
  }
}

/** Renders highlighted code or plain text, fetched once the URL resolves. */
function CodeOrTextPreview({
  url,
  kind,
  noPreviewLabel,
}: {
  url: string;
  kind: Extract<FileKind, { kind: "code" | "text" }>;
  noPreviewLabel: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch(url)
      .then(res => res.text())
      .then(async raw => {
        if (cancelled) return;
        if (kind.kind === "text") {
          setText(raw);
          return;
        }
        const { codeToHtml } = await import("shiki");
        const rendered = await codeToHtml(raw, {
          lang: kind.lang,
          themes: { light: "github-light", dark: "github-dark-dimmed" },
          defaultColor: false,
        });
        if (!cancelled) setHtml(rendered);
      })
      .catch(() => {
        if (!cancelled) setText(noPreviewLabel);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, kind, noPreviewLabel]);

  if (loading) {
    return <Loader2 className="size-6 animate-spin text-white/70" />;
  }
  if (html) {
    return (
      <div
        className="max-h-full max-w-full overflow-auto rounded-lg p-4 text-xs shadow-2xl [&_pre]:bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre className="max-h-full max-w-full overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs text-white">
      {text}
    </pre>
  );
}

/** Archives don't get the full viewer — just a quick "download this?" prompt. */
function ArchiveDownloadConfirm({
  file,
  url,
  onOpenChange,
}: {
  file: ViewableFile;
  url: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("FileViewer");
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("archiveTitle", { name: file.name })}
          </DialogTitle>
          <DialogDescription className="mt-2 leading-relaxed">
            {t("archiveDesc")}
          </DialogDescription>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!url}
            onClick={() => {
              if (url) void downloadUrl(url, file.name);
              onOpenChange(false);
            }}
            autoFocus
          >
            <Download className="size-4" />
            {t("download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Top bar + body for a single open file — keyed by file identity in the parent so switching files remounts local UI state (e.g. the metadata panel) for free. */
function FileViewerContent({
  file,
  url,
  kind,
  onClose,
}: {
  file: ViewableFile;
  url: string | undefined;
  kind: FileKind;
  onClose: () => void;
}) {
  const t = useTranslations("FileViewer");
  const [showMetadata, setShowMetadata] = useState(false);

  const actions: ActionMenuItem[] = [
    {
      key: "download",
      label: t("download"),
      icon: <Download className="size-4" />,
      onSelect: () => {
        if (url) void downloadUrl(url, file.name);
      },
    },
    {
      key: "copy-link",
      label: t("copyLink"),
      icon: <Copy className="size-4" />,
      onSelect: () => {
        if (!url) return;
        void navigator.clipboard
          .writeText(url)
          .then(() => toast.success(t("linkCopied")));
      },
    },
    ...(kind.kind === "image"
      ? [
          {
            key: "metadata",
            label: t("metadata"),
            icon: <Info className="size-4" />,
            onSelect: () => setShowMetadata(v => !v),
          },
        ]
      : []),
  ];

  return (
    <div
      className="flex h-full w-full flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-white sm:px-6">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {file.name}
        </span>
        <ActionMenu
          ariaLabel={file.name}
          items={actions}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            >
              <MoreVertical className="size-4" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {showMetadata && kind.kind === "image" && (
        <div className="mx-4 mb-2 shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90 sm:mx-6">
          {file.width && file.height && (
            <p>
              {t("dimensions")}: {file.width} × {file.height}
            </p>
          )}
          {typeof file.size === "number" && (
            <p>
              {t("size")}: {formatFileSize(file.size)}
            </p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-6 sm:px-6">
        {!url ? (
          <Loader2 className="size-6 animate-spin text-white/70" />
        ) : kind.kind === "image" ? (
          <img
            src={url}
            alt={file.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : kind.kind === "code" || kind.kind === "text" ? (
          <CodeOrTextPreview
            url={url}
            kind={kind}
            noPreviewLabel={t("noPreview")}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <FileQuestion className="size-10" />
            <p className="text-sm">{t("noPreview")}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadUrl(url, file.name)}
            >
              <Download className="size-4" />
              {t("download")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function GlobalFileViewer({
  file,
  onClose,
}: {
  file: ViewableFile | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!file) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [file, onClose]);

  const kind = useMemo(
    () => (file ? detectFileKind(file.name, file.contentType) : null),
    [file]
  );

  const resolvedUrl = useQuery(
    api.files.getUrl,
    file && !file.url ? { storageId: file.storageId as Id<"_storage"> } : "skip"
  );
  const url = file?.url ?? resolvedUrl ?? undefined;

  if (!mounted || !file || !kind) return null;

  if (kind.kind === "archive") {
    return (
      <ArchiveDownloadConfirm
        file={file}
        url={url}
        onOpenChange={open => {
          if (!open) onClose();
        }}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <FileViewerContent
        key={file.storageId}
        file={file}
        url={url}
        kind={kind}
        onClose={onClose}
      />
    </div>,
    document.body
  );
}
