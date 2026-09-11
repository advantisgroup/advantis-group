"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex, useMutation } from "convex/react";
import { Download, Eye, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiButton } from "@/components/ai/AiButton";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import {
  type ApplicantDetail,
  ensureRichHtml,
  RICH_CV_FIELDS,
  textToHtml,
} from "@/components/applicants/applicant-types";
import { CvFallbackModal, type CvFallbackFormState } from "@/components/applicants/CvFallbackModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type CvRescanOutput, useApplicantsApi } from "@/lib/applicants-api";
import { cvImportFiles } from "@/lib/cv-import-files";

export function applicantToFormState(applicant: ApplicantDetail): CvFallbackFormState {
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

interface Review {
  file: File;
  values: CvFallbackFormState;
  fromPdf: (keyof CvFallbackFormState)[];
  storageId?: Id<"_storage">;
}

export function Dokumente({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const convex = useConvex();
  const applicantsApi = useApplicantsApi();
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);
  const addDocument = useMutation(api.applicants.addDocument);
  const removeDocument = useMutation(api.applicants.removeDocument);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const rescanInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // The latest re-read of this applicant's CV. Followed by subject rather
  // than by the run started here, so leaving the tab mid-read and coming
  // back still finds it — and so does the AI dock.
  const rescan = useAiRun<CvRescanOutput>({ subjectKey: `cvRescan:${applicant._id}` }, parseJson);
  const rescanUnseen = !!rescan.run && !rescan.run.seenAt;
  const rescanFile = rescan.run ? cvImportFiles.get(rescan.run._id) : null;
  const [starting, setStarting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  async function startRescan(file: File) {
    setStarting(true);
    try {
      const { runId } = await applicantsApi.startRescan(file, applicant._id);
      cvImportFiles.set(runId, file);
    } catch (e) {
      handleError(e);
    } finally {
      setStarting(false);
    }
  }

  function handleRescan(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    void startRescan(file);
  }

  /** The PDF the run read — still in memory if it was picked in this tab,
   *  otherwise fetched back from where the API staged it. */
  async function resolveRunFile(result: CvRescanOutput): Promise<File | null> {
    if (rescanFile) return rescanFile;
    const url = await convex.query(api.applicants.stagedFileUrl, { storageId: result.storageId });
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    return new File([blob], result.fileName, { type: "application/pdf" });
  }

  async function openReview() {
    const result = rescan.result;
    if (!result) return;
    setOpening(true);
    try {
      const file = await resolveRunFile(result);
      if (!file) {
        toast.error(t("pdfLoadFailed"));
        return;
      }
      const current = applicantToFormState(applicant);
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
      setReview({ file, values: merged, fromPdf, storageId: result.storageId });
    } catch (e) {
      handleError(e);
    } finally {
      setOpening(false);
    }
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

  async function handleRemove(documentId: Id<"applicantDocuments">, name: string) {
    const ok = await confirm({
      title: t("deleteDocument"),
      description: t("deleteDocumentConfirm", { name }),
      details: [{ label: tc("fieldName"), value: name }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeDocument({ documentId }).catch(handleError);
  }

  const rescanWorking = rescan.state === "working" || starting;
  const rescanFailed =
    rescan.state === "error" || rescan.state === "interrupted" || rescan.state === "cancelled";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
        <p className="text-sm font-semibold">
          {t("documentsInFile")}
          <span className="ml-1.5 text-muted-foreground">({applicant.documents.length})</span>
        </p>
        <AiButton
          working={rescanWorking}
          disabled={rescanWorking}
          onClick={() => rescanInputRef.current?.click()}
          aria-label={t("rescanCv")}
        >
          {t("rescanCv")}
        </AiButton>
        <input
          ref={rescanInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            handleRescan(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {rescanUnseen && (
        <div className="border-b border-border/70 p-4">
          <AiRunCard
            view={rescan}
            titles={{ done: t("rescanReady") }}
            onRetry={rescanFile ? () => void startRescan(rescanFile) : undefined}
            onDismiss={rescan.markSeen}
          >
            <Button size="sm" onClick={() => void openReview()} disabled={opening}>
              {opening && <Loader2 className="animate-spin" />}
              {t("rescanReview")}
            </Button>
          </AiRunCard>
          {rescanFailed && rescanFile && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                setReview({
                  file: rescanFile,
                  values: applicantToFormState(applicant),
                  fromPdf: [],
                })
              }
            >
              {t("fillManually")}
            </Button>
          )}
        </div>
      )}
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {applicant.documents.map((d) => (
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
                <Button variant="outline" size="sm" asChild aria-label={t("view")}>
                  <Link href={`/hr/${applicant._id}/dokumente/${d._id}`}>
                    <Eye className="size-4" />
                    <span className="hidden md:inline">{t("view")}</span>
                  </Link>
                </Button>
                {d.url && (
                  <Button variant="outline" size="sm" asChild aria-label={t("download")}>
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

          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-3.5 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30 hover:text-foreground"
          >
            <UploadCloud className="size-5" />
            <span className="font-medium">{t("addDocument")}</span>
          </button>
          <input
            ref={docInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("maxFileSizeHint")}</p>
      </CardContent>
      {review && (
        <CvFallbackModal
          open
          onOpenChange={(open) => {
            if (!open) setReview(null);
          }}
          mode="update"
          applicantId={applicant._id}
          file={review.file}
          initialValues={review.values}
          initialFromPdfFields={review.fromPdf}
          pendingStorageId={review.storageId}
          onSaved={() => {
            setReview(null);
            rescan.markSeen();
          }}
        />
      )}
    </Card>
  );
}
