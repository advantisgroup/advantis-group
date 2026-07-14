"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { Copy, Download, FileQuestion, Info, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { downloadWithProgress } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { detectFileKind, type FileKind } from "./file-kind";

import type { ViewableFile } from "./FileViewerProvider";

async function downloadUrl(url: string, name: string, label: string) {
  try {
    await downloadWithProgress(url, name, label);
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

/** A single label/value line in the metadata popout, truncating long values with a title tooltip. */
function MetadataRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium" title={value}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}

interface ExifSummary {
  camera?: string;
  lens?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  focalLength?: string;
  dateTaken?: Date;
  latitude?: number;
  longitude?: number;
}

function formatShutterSpeed(seconds: number): string {
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

interface RawExifTags {
  Make?: string;
  Model?: string;
  LensModel?: string;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  FocalLength?: number;
  DateTimeOriginal?: Date;
  latitude?: number;
  longitude?: number;
}

/** Reads camera/lens/exposure/GPS out of the file's own EXIF data (JPEG, HEIC, TIFF, …) rather than trusting anything passed in. Resolves to null — never rejects — for files with no/unreadable EXIF (e.g. re-encoded by Snapchat/Instagram). */
async function readExif(url: string): Promise<ExifSummary | null> {
  const rawTags: unknown = await import("exifr")
    .then(({ parse }) =>
      parse(url, {
        tiff: true,
        exif: true,
        gps: true,
        translateValues: true,
        reviveValues: true,
        mergeOutput: true,
      })
    )
    .catch(() => null);
  if (!rawTags) return null;
  const tags = rawTags as RawExifTags;

  const camera = [tags.Make, tags.Model]
    .filter((v): v is string => typeof v === "string")
    .filter((v, i, arr) => i === 0 || !v.includes(arr[0]))
    .join(" ")
    .trim();

  const summary: ExifSummary = {
    camera: camera || undefined,
    lens: typeof tags.LensModel === "string" ? tags.LensModel : undefined,
    aperture:
      typeof tags.FNumber === "number" ? `f/${tags.FNumber}` : undefined,
    shutterSpeed:
      typeof tags.ExposureTime === "number"
        ? formatShutterSpeed(tags.ExposureTime)
        : undefined,
    iso: typeof tags.ISO === "number" ? `ISO ${tags.ISO}` : undefined,
    focalLength:
      typeof tags.FocalLength === "number"
        ? `${Math.round(tags.FocalLength)}mm`
        : undefined,
    dateTaken:
      tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : undefined,
    latitude: typeof tags.latitude === "number" ? tags.latitude : undefined,
    longitude: typeof tags.longitude === "number" ? tags.longitude : undefined,
  };

  const hasAnyField = Object.values(summary).some(v => v !== undefined);
  return hasAnyField ? summary : null;
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
              if (url) void downloadUrl(url, file.name, t("downloading"));
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
  const locale = useLocale();
  const [metadataOpen, setMetadataOpen] = useState(false);
  // Dimensions the browser actually decoded from the image, rather than
  // whatever (possibly stale/unset) width/height was passed in with the file.
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const dimensions =
    naturalSize ??
    (file.width && file.height
      ? { width: file.width, height: file.height }
      : null);

  const [exif, setExif] = useState<ExifSummary | null>(null);
  const [exifStatus, setExifStatus] = useState<"idle" | "loading" | "done">(
    "idle"
  );

  useEffect(() => {
    if (
      !metadataOpen ||
      kind.kind !== "image" ||
      !url ||
      exifStatus !== "idle"
    ) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExifStatus("loading");
    void readExif(url)
      .then(summary => {
        if (cancelled) return;
        setExif(summary);
      })
      .catch(() => {
        if (!cancelled) setExif(null);
      })
      .finally(() => {
        if (!cancelled) setExifStatus("done");
      });
    return () => {
      cancelled = true;
    };
  }, [metadataOpen, kind, url, exifStatus]);

  const actions: {
    key: string;
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    active?: boolean;
  }[] = [
    {
      key: "download",
      label: t("download"),
      icon: <Download className="size-4" />,
      onSelect: () => {
        if (url) void downloadUrl(url, file.name, t("downloading"));
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
  ];

  return (
    <div
      className="flex h-full w-full flex-col"
      onClick={e => e.stopPropagation()}
    >
      <TooltipProvider delayDuration={300}>
        <div className="flex shrink-0 items-center gap-1 px-4 py-3 text-white sm:px-6">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {file.name}
          </span>
          {actions.map(action => (
            <Tooltip key={action.key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={action.label}
                  aria-pressed={action.active}
                  onClick={action.onSelect}
                  className={cn(
                    "shrink-0 text-white hover:bg-white/10 hover:text-white",
                    action.active && "bg-white/10"
                  )}
                >
                  {action.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          ))}
          <Popover open={metadataOpen} onOpenChange={setMetadataOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("metadata")}
                aria-pressed={metadataOpen}
                className={cn(
                  "shrink-0 text-white hover:bg-white/10 hover:text-white",
                  metadataOpen && "bg-white/10"
                )}
              >
                <Info className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="z-[110] w-80 text-foreground"
            >
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
                <MetadataRow label={t("name")} value={file.name} />
                {file.contentType && (
                  <MetadataRow label={t("type")} value={file.contentType} />
                )}
                {typeof file.size === "number" && (
                  <MetadataRow
                    label={t("size")}
                    value={formatFileSize(file.size)}
                  />
                )}
                {dimensions && (
                  <MetadataRow
                    label={t("dimensions")}
                    value={`${dimensions.width} × ${dimensions.height}`}
                  />
                )}
                {typeof file.modifiedAt === "number" && (
                  <MetadataRow
                    label={t("modified")}
                    value={formatDateTime(file.modifiedAt, locale)}
                  />
                )}
              </dl>

              {exifStatus === "loading" && (
                <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("loadingExif")}
                </div>
              )}

              {exif && (
                <>
                  <p className="mt-3 border-t pt-3 text-xs font-semibold text-muted-foreground">
                    {t("camera")}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
                    {exif.camera && (
                      <MetadataRow label={t("camera")} value={exif.camera} />
                    )}
                    {exif.lens && (
                      <MetadataRow label={t("lens")} value={exif.lens} />
                    )}
                    {exif.dateTaken && (
                      <MetadataRow
                        label={t("dateTaken")}
                        value={formatDateTime(exif.dateTaken.getTime(), locale)}
                      />
                    )}
                    {exif.aperture && (
                      <MetadataRow
                        label={t("aperture")}
                        value={exif.aperture}
                      />
                    )}
                    {exif.shutterSpeed && (
                      <MetadataRow
                        label={t("shutterSpeed")}
                        value={exif.shutterSpeed}
                      />
                    )}
                    {exif.iso && (
                      <MetadataRow label={t("iso")} value={exif.iso} />
                    )}
                    {exif.focalLength && (
                      <MetadataRow
                        label={t("focalLength")}
                        value={exif.focalLength}
                      />
                    )}
                    {typeof exif.latitude === "number" &&
                      typeof exif.longitude === "number" && (
                        <MetadataRow
                          label={t("location")}
                          value={`${exif.latitude.toFixed(5)}, ${exif.longitude.toFixed(5)}`}
                          href={`https://www.google.com/maps?q=${exif.latitude},${exif.longitude}`}
                        />
                      )}
                  </dl>
                </>
              )}
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white hover:bg-white/10 hover:text-white"
                aria-label={t("close")}
                onClick={onClose}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("close")}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-6 sm:px-6">
        {!url ? (
          <Loader2 className="size-6 animate-spin text-white/70" />
        ) : kind.kind === "image" ? (
          <img
            src={url}
            alt={file.name}
            onLoad={e =>
              setNaturalSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
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
              onClick={() => downloadUrl(url, file.name, t("downloading"))}
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
