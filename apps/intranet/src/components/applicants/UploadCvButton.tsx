"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { PenLine, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { blankCvFallbackForm, CvFallbackModal } from "@/components/applicants/CvFallbackModal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { useApplicantsApi } from "@/lib/applicants-api";

/** PDF upload → Claude extraction → new "Neue Bewerber" record, then navigate there. */
export function UploadCvButton() {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const applicantsApi = useApplicantsApi();
  const addDocument = useMutation(api.applicants.addDocument);
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);
  // Extraction is a multi-second Claude call with no progress events to
  // report, so the honest thing to show is which file is being read, how far
  // into the batch it is, and that time is actually passing — a disabled
  // button alone is indistinguishable from a hang.
  const [job, setJob] = useState<{ file: string; index: number; total: number } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const toastId = useRef<string | number | null>(null);

  useEffect(() => {
    if (!job) return;
    setSeconds(0);
    const startedAt = Date.now();
    const id = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [job]);

  useEffect(() => {
    if (!job) {
      if (toastId.current !== null) {
        toast.dismiss(toastId.current);
        toastId.current = null;
      }
      return;
    }
    toastId.current = toast.loading(t("extractAnalyzing", { file: job.file, seconds }), {
      id: toastId.current ?? undefined,
      description: job.total > 1 ? t("extractBatch", job) : undefined,
      duration: Infinity,
    });
  }, [job, seconds, t]);

  async function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files ?? []).filter((f) => f.type === "application/pdf");
    if (!pdfs.length) {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      setJob({ file: file.name, index: i + 1, total: pdfs.length });
      try {
        const result = await applicantsApi.extract(file);
        if (result.kind === "created") {
          toast.success(t("uploadSuccess", { name: file.name }));
          router.push(`/hr/${result.applicantId}/uebersicht`);
          continue;
        }

        const attach = await confirm({
          title: t("duplicateFoundTitle"),
          description: t("duplicateFoundDescription", {
            name: result.duplicate.name,
            field: t(`duplicateMatchedOn.${result.duplicate.matchedOn}`),
          }),
          confirmLabel: t("duplicateAttach"),
          cancelLabel: t("duplicateCreateNew"),
          destructive: false,
        });
        if (attach) {
          await addDocument({
            applicantId: result.duplicate.applicantId,
            storageId: result.pendingStorageId,
            fileName: file.name,
          });
          toast.success(t("duplicateAttached", { name: result.duplicate.name }));
          router.push(`/hr/${result.duplicate.applicantId}/uebersicht`);
        } else {
          const forced = await applicantsApi.extract(file, true);
          if (forced.kind === "created") {
            toast.success(t("uploadSuccess", { name: file.name }));
            router.push(`/hr/${forced.applicantId}/uebersicht`);
          }
        }
      } catch (e) {
        console.error("[applicants] extract() failed, opening fallback:", e);
        const remaining = pdfs.length - i - 1;
        if (remaining > 0) {
          toast.info(t("uploadBatchInterrupted", { remaining }));
        }
        setJob(null);
        setFallbackFile(file);
        return;
      }
    }
    setJob(null);
  }

  function openManualEntry() {
    manualInputRef.current?.click();
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={!!job}
          aria-label={job ? t("uploading") : t("uploadCv")}
        >
          <UploadCloud className="size-4" />
          <span className="hidden md:inline">
            {job ? (job.total > 1 ? t("extractBatch", job) : t("uploading")) : t("uploadCv")}
          </span>
        </Button>
        <Button variant="outline" onClick={openManualEntry} aria-label={t("fillManually")}>
          <PenLine className="size-4" />
          <span className="hidden md:inline">{t("fillManually")}</span>
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={manualInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setFallbackFile(file);
        }}
      />
      {fallbackFile && (
        <CvFallbackModal
          open
          onOpenChange={(open) => {
            if (!open) setFallbackFile(null);
          }}
          mode="create"
          file={fallbackFile}
          initialValues={blankCvFallbackForm()}
          onSaved={(applicantId) => {
            setFallbackFile(null);
            router.push(`/hr/${applicantId}/uebersicht`);
          }}
        />
      )}
    </>
  );
}
