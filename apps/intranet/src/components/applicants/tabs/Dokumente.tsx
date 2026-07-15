"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import {
  Download,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  type ApplicantDetail,
  ensureRichHtml,
  RICH_CV_FIELDS,
  textToHtml,
} from "@/components/applicants/applicant-types";
import {
  CvFallbackModal,
  type CvFallbackFormState,
} from "@/components/applicants/CvFallbackModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useApplicantsApi } from "@/lib/applicants-api";

export function applicantToFormState(
  applicant: ApplicantDetail
): CvFallbackFormState {
  return {
    name: applicant.name,
    email: applicant.email ?? "",
    telefon: applicant.telefon ?? "",
    adresse: applicant.adresse ?? "",
    geburtsdatum: applicant.geburtsdatum ?? "",
    position: applicant.position ?? "",
    ausbildung: ensureRichHtml(applicant.ausbildung ?? ""),
    berufserfahrung: ensureRichHtml(applicant.berufserfahrung ?? ""),
    zusammenfassung: ensureRichHtml(applicant.zusammenfassung ?? ""),
    skills: applicant.skills,
  };
}

export function Dokumente({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const applicantsApi = useApplicantsApi();
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);
  const addDocument = useMutation(api.applicants.addDocument);
  const removeDocument = useMutation(api.applicants.removeDocument);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const tc = useTranslations("Common");
  const rescanInputRef = useRef<HTMLInputElement>(null);

  const [rescanFile, setRescanFile] = useState<File | null>(null);
  const [rescanInitialValues, setRescanInitialValues] =
    useState<CvFallbackFormState | null>(null);
  const [rescanFromPdfFields, setRescanFromPdfFields] = useState<
    (keyof CvFallbackFormState)[]
  >([]);
  const [rescanStorageId, setRescanStorageId] = useState<
    Id<"_storage"> | undefined
  >(undefined);

  async function handleRescan(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    const current = applicantToFormState(applicant);
    try {
      const result = await applicantsApi.rescan(file);
      const merged = { ...current };
      const fromPdf: (keyof CvFallbackFormState)[] = [];
      for (const key of Object.keys(current) as (keyof CvFallbackFormState)[]) {
        if (key === "skills") continue;
        const value = result.extractedFields[key];
        if (typeof value === "string" && value.trim()) {
          merged[key] = (RICH_CV_FIELDS as readonly string[]).includes(key)
            ? textToHtml(value)
            : value;
          fromPdf.push(key);
        }
      }
      if (result.extractedFields.skills.length > 0) {
        merged.skills = result.extractedFields.skills;
        fromPdf.push("skills");
      }
      setRescanInitialValues(merged);
      setRescanFromPdfFields(fromPdf);
      setRescanStorageId(result.storageId);
    } catch (e) {
      handleError(e);
      setRescanInitialValues(current);
      setRescanFromPdfFields([]);
      setRescanStorageId(undefined);
    }
    setRescanFile(file);
  }

  function openRescan(input: HTMLInputElement | null) {
    input?.click();
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await addDocument({
        applicantId: applicant._id,
        storageId,
        fileName: file.name,
      });
      toast.success(t("documentAdded"));
    } catch (e) {
      handleError(e);
    }
  }

  async function handleRemove(
    documentId: Id<"applicantDocuments">,
    name: string
  ) {
    const ok = await confirm({
      title: t("deleteDocument"),
      description: t("deleteDocumentConfirm", { name }),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeDocument({ documentId }).catch(handleError);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
        <p className="text-sm font-semibold">
          {t("documentsInFile")}
          <span className="ml-1.5 text-muted-foreground">
            ({applicant.documents.length})
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openRescan(rescanInputRef.current)}
          aria-label={t("rescanCv")}
        >
          <RefreshCw className="size-4" />
          <span className="hidden md:inline">{t("rescanCv")}</span>
        </Button>
        <input
          ref={rescanInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => {
            void handleRescan(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {applicant.documents.map(d => (
            <div
              key={d._id}
              className="flex flex-col gap-3 rounded-lg border border-border/70 p-3.5"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("uploadedOn", {
                      date: new Date(d.createdAt).toLocaleDateString(),
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  aria-label={t("view")}
                >
                  <Link
                    href={`/applicants/${applicant._id}/dokumente/${d._id}`}
                  >
                    <Eye className="size-4" />
                    <span className="hidden md:inline">{t("view")}</span>
                  </Link>
                </Button>
                {d.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    aria-label={t("download")}
                  >
                    <a href={d.url} download={d.fileName}>
                      <Download className="size-4" />
                      <span className="hidden md:inline">{t("download")}</span>
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tc("delete")}
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleRemove(d._id, d.fileName)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <label className="flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-3.5 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30 hover:text-foreground">
            <UploadCloud className="size-5" />
            <span className="font-medium">{t("addDocument")}</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => {
                void handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t("maxFileSizeHint")}</p>
      </CardContent>
      {rescanFile && rescanInitialValues && (
        <CvFallbackModal
          open
          onOpenChange={open => {
            if (!open) {
              setRescanFile(null);
              setRescanInitialValues(null);
              setRescanFromPdfFields([]);
              setRescanStorageId(undefined);
            }
          }}
          mode="update"
          applicantId={applicant._id}
          file={rescanFile}
          initialValues={rescanInitialValues}
          initialFromPdfFields={rescanFromPdfFields}
          pendingStorageId={rescanStorageId}
          onSaved={() => {
            setRescanFile(null);
            setRescanInitialValues(null);
            setRescanFromPdfFields([]);
            setRescanStorageId(undefined);
          }}
        />
      )}
    </Card>
  );
}
