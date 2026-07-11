"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { PenLine, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  blankCvFallbackForm,
  CvFallbackModal,
} from "@/components/applicants/CvFallbackModal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { useApplicantsApi } from "@/lib/applicants-api";

/** PDF upload → Claude extraction → new "Neue Bewerber" record, then navigate there. */
export function UploadCvButton() {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const applicantsApi = useApplicantsApi();
  const addDocument = useMutation(api.applicants.addDocument);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);

  async function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files ?? []).filter(
      f => f.type === "application/pdf"
    );
    if (!pdfs.length) {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      setUploading(file.name);
      try {
        const result = await applicantsApi.extract(file);
        if (result.kind === "created") {
          toast.success(t("uploadSuccess", { name: file.name }));
          router.push(`/applicants/${result.applicantId}`);
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
          toast.success(
            t("duplicateAttached", { name: result.duplicate.name })
          );
          router.push(`/applicants/${result.duplicate.applicantId}`);
        } else {
          const forced = await applicantsApi.extract(file, true);
          if (forced.kind === "created") {
            toast.success(t("uploadSuccess", { name: file.name }));
            router.push(`/applicants/${forced.applicantId}`);
          }
        }
      } catch (e) {
        console.error("[applicants] extract() failed, opening fallback:", e);
        if (isMobile) {
          handleError(e, t("uploadFailed", { name: file.name }));
          continue;
        }
        const remaining = pdfs.length - i - 1;
        if (remaining > 0) {
          toast.info(t("uploadBatchInterrupted", { remaining }));
        }
        setUploading(null);
        setFallbackFile(file);
        return;
      }
    }
    setUploading(null);
  }

  function openManualEntry() {
    if (isMobile) {
      toast.info(t("fallbackDesktopOnly"));
      return;
    }
    manualInputRef.current?.click();
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={!!uploading}
        >
          <UploadCloud className="size-4" />
          {uploading ? t("uploading") : t("uploadCv")}
        </Button>
        <Button variant="outline" onClick={openManualEntry}>
          <PenLine className="size-4" />
          {t("fillManually")}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={e => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={manualInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setFallbackFile(file);
        }}
      />
      {fallbackFile && (
        <CvFallbackModal
          open
          onOpenChange={open => {
            if (!open) setFallbackFile(null);
          }}
          mode="create"
          file={fallbackFile}
          initialValues={blankCvFallbackForm()}
          onSaved={applicantId => {
            setFallbackFile(null);
            router.push(`/applicants/${applicantId}`);
          }}
        />
      )}
    </>
  );
}
