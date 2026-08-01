"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileArchive, FileImage, FileText, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { detectFileKind } from "@/components/file-viewer/file-kind";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { OneDriveFolderPicker } from "@/components/attachments/OneDriveFolderPicker";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { HR_FOLDER_BASE } from "@/lib/onedrive-scopes";
import { useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

const DOCUMENT_CATEGORIES = ["documents", "legal", "payroll", "contract", "other"] as const;
type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Coarser than `FileKind` (which distinguishes every code language) — just
 * enough buckets for a useful browse-side filter. */
type DocumentType = "image" | "pdf" | "doc" | "other";

const DOC_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function documentTypeOf(fileName: string, contentType?: string | null): DocumentType {
  const kind = detectFileKind(fileName, contentType ?? undefined);
  if (kind.kind === "image") return "image";
  if (kind.kind === "pdf") return "pdf";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (DOC_EXTENSIONS.has(ext)) return "doc";
  return "other";
}

/** Small thumbnail/icon preview — fetches a OneDrive thumbnail for images,
 * otherwise falls back to a file-type icon. Mirrors GlobalFileViewer's own
 * kind detection so the icon always matches what opening the file shows. */
function DocumentThumbnail({
  fileName,
  contentType,
  oneDriveItemId,
  legacyUrl,
}: {
  fileName: string;
  contentType?: string | null;
  oneDriveItemId?: string | null;
  legacyUrl?: string | null;
}) {
  const od = useOneDriveApi();
  const kind = detectFileKind(fileName, contentType ?? undefined);
  const isImage = kind.kind === "image";
  const [thumbUrl, setThumbUrl] = useState<string | null>(legacyUrl && isImage ? legacyUrl : null);

  // Graph generates real thumbnails for PDFs and Office docs too, not just
  // images — so every kind gets a shot at an actual little picture of the
  // file (a proper file-explorer-style preview), not just an icon. Only
  // `thumbnailUrl` is ever used here — `previewUrl` is an embeddable Office
  // Online *page*, not an image, so it can't back an `<img>` tag.
  useEffect(() => {
    if (!oneDriveItemId || legacyUrl) return;
    let cancelled = false;
    void od
      .preview(oneDriveItemId)
      .then((r) => {
        if (!cancelled) setThumbUrl(r.thumbnailUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneDriveItemId, legacyUrl]);

  if (thumbUrl) {
    return (
      <img src={thumbUrl} alt="" className="size-full rounded-md object-cover" loading="lazy" />
    );
  }
  const Icon =
    kind.kind === "pdf"
      ? FileText
      : kind.kind === "archive"
        ? FileArchive
        : isImage
          ? FileImage
          : FileText;
  return (
    <div className="flex size-full items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-7" />
    </div>
  );
}

export default function EmployeeDocumentsPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const { openFileViewer } = useFileViewer();
  const params = useParams<{ id: string }>();
  const employeeProfileId = params.id as Id<"employeeProfiles">;
  const documents = useQuery(api.humanResources.listDocuments, { employeeProfileId });
  const folderInfo = useQuery(api.humanResources.employeeFolderName, { employeeProfileId });
  const addDocument = useMutation(api.humanResources.addDocument);
  const removeDocument = useMutation(api.humanResources.removeDocument);
  const oneDriveApi = useOneDriveApi();
  const [category, setCategory] = useState<DocumentCategory>("documents");
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");

  const basePath = folderInfo ? `${HR_FOLDER_BASE}/${folderInfo.folderName}` : null;

  async function uploadDocument(file: File) {
    setUploading(true);
    try {
      const uploaded = await oneDriveApi.attachToHR(
        employeeProfileId,
        file,
        undefined,
        folder || undefined,
      );
      await addDocument({
        employeeProfileId,
        oneDriveItemId: uploaded.oneDriveItemId,
        oneDrivePath: uploaded.oneDrivePath,
        fileName: uploaded.name,
        contentType: uploaded.contentType,
        size: uploaded.size,
        category,
      });
      toast.success(t("documentAdded"));
    } catch (error) {
      handleError(error);
    } finally {
      setUploading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!documents) return undefined;
    return documents.filter((document) => {
      if (categoryFilter !== "all" && document.category !== categoryFilter) return false;
      if (
        typeFilter !== "all" &&
        documentTypeOf(document.fileName, document.contentType) !== typeFilter
      ) {
        return false;
      }
      return true;
    });
  }, [documents, categoryFilter, typeFilter]);

  if (documents === undefined || filtered === undefined) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("employeeDocuments")}</h2>
          <p className="text-sm text-muted-foreground">{t("employeeDocumentsDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as DocumentCategory)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`employeeDocumentCategory.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {basePath && (
            <OneDriveFolderPicker basePath={basePath} value={folder} onChange={setFolder} />
          )}
          <label
            className={buttonVariants({
              className: uploading || !basePath ? "pointer-events-none opacity-50" : undefined,
            })}
          >
            <Upload className="size-4" />
            {t("addDocument")}
            <input
              type="file"
              className="sr-only"
              disabled={uploading || !basePath}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadDocument(file);
              }}
            />
          </label>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value as DocumentCategory | "all")}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documentAllCategories")}</SelectItem>
              {DOCUMENT_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`employeeDocumentCategory.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as DocumentType | "all")}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documentAllTypes")}</SelectItem>
              <SelectItem value="image">{t("documentTypeImage")}</SelectItem>
              <SelectItem value="pdf">{t("documentTypePdf")}</SelectItem>
              <SelectItem value="doc">{t("documentTypeDoc")}</SelectItem>
              <SelectItem value="other">{t("documentTypeOther")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState icon={<FileText />} title={t("noDocumentsYet")} />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("documentNoMatches")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((document) => (
            <div
              key={document._id}
              className="group relative flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-2"
            >
              <button
                type="button"
                className="aspect-square w-full overflow-hidden rounded-md"
                onClick={() =>
                  openFileViewer({
                    storageId: document.storageId,
                    oneDriveItemId: document.oneDriveItemId ?? undefined,
                    name: document.fileName,
                    contentType: document.contentType ?? undefined,
                    size: document.size ?? undefined,
                    modifiedAt: document.createdAt,
                    url: document.legacyUrl ?? undefined,
                  })
                }
              >
                <DocumentThumbnail
                  fileName={document.fileName}
                  contentType={document.contentType}
                  oneDriveItemId={document.oneDriveItemId}
                  legacyUrl={document.legacyUrl}
                />
              </button>
              <div className="min-w-0 px-0.5">
                <p className="truncate text-xs font-medium" title={document.fileName}>
                  {document.fileName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {t(`employeeDocumentCategory.${document.category}`)} ·{" "}
                  {document.size ? formatFileSize(document.size) : "-"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatDateTime(document.createdAt, locale)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tc("delete")}
                className={cn(
                  "absolute right-1 top-1 opacity-100 backdrop-blur transition-opacity md:opacity-0 md:group-hover:opacity-100",
                )}
                onClick={() =>
                  void removeDocument({ documentId: document._id }).then((result) => {
                    if (result.oneDriveItemId) {
                      void oneDriveApi.remove(result.oneDriveItemId).catch(() => {});
                    }
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
