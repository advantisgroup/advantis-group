"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
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
import { formatFileSize } from "@/lib/upload";

const DOCUMENT_CATEGORIES = ["documents", "legal", "payroll", "contract", "other"] as const;
type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export default function EmployeeDocumentsPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const { openFileViewer } = useFileViewer();
  const params = useParams<{ id: string }>();
  const employeeProfileId = params.id as Id<"employeeProfiles">;
  const documents = useQuery(api.humanResources.listDocuments, { employeeProfileId });
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const addDocument = useMutation(api.humanResources.addDocument);
  const removeDocument = useMutation(api.humanResources.removeDocument);
  const [category, setCategory] = useState<DocumentCategory>("documents");
  const [uploading, setUploading] = useState(false);

  async function uploadDocument(file: File) {
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploaded = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploaded.ok) throw new Error(t("documentUploadFailed"));
      const { storageId } = (await uploaded.json()) as { storageId: Id<"_storage"> };
      await addDocument({
        employeeProfileId,
        storageId,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
        category,
      });
      toast.success(t("documentAdded"));
    } catch (error) {
      handleError(error);
    } finally {
      setUploading(false);
    }
  }

  if (documents === undefined) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("employeeDocuments")}</h2>
          <p className="text-sm text-muted-foreground">{t("employeeDocumentsDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
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
          <label
            className={buttonVariants({
              className: uploading ? "pointer-events-none opacity-50" : undefined,
            })}
          >
            <Upload className="size-4" />
            {t("addDocument")}
            <input
              type="file"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadDocument(file);
              }}
            />
          </label>
        </div>
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={<FileText />} title={t("noDocumentsYet")} />
      ) : (
        <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-card">
          {documents.map((document) => (
            <div key={document._id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors"
                onClick={() =>
                  openFileViewer({
                    storageId: document.storageId,
                    name: document.fileName,
                    contentType: document.contentType ?? undefined,
                    size: document.size ?? undefined,
                    modifiedAt: document.createdAt,
                    url: document.url ?? undefined,
                  })
                }
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{document.fileName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`employeeDocumentCategory.${document.category}`)} ·{" "}
                    {document.size ? formatFileSize(document.size) : "-"} ·{" "}
                    {formatDateTime(document.createdAt, locale)}
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tc("delete")}
                onClick={() => void removeDocument({ documentId: document._id })}
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
