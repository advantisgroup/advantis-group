"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Download, Eye, RefreshCw, Trash2, UploadCloud } from "lucide-react";
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
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold">{t("documentsInFile")}</p>
        {applicant.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDocumentsYet")}</p>
        ) : (
          <div className="space-y-2">
            {applicant.documents.map(d => (
              <div
                key={d._id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("uploadedOn", {
                      date: new Date(d.createdAt).toLocaleDateString(),
                    })}
                  </p>
                </div>
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
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleRemove(d._id, d.fileName)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label>
            <Button asChild variant="outline" aria-label={t("addDocument")}>
              <span>
                <UploadCloud className="size-4" />
                <span className="hidden md:inline">{t("addDocument")}</span>
              </span>
            </Button>
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
          <Button
            variant="outline"
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
