"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2, PenLine, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useApplicantsApi } from "@/lib/applicants-api";
import { cvImportFiles } from "@/lib/cv-import-files";

/** Hands each PDF to its own run and gets out of the way — progress, results
 * and duplicate decisions all live in CvImportTray, which survives a refresh. */
export function UploadCvButton() {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const applicantsApi = useApplicantsApi();
  // Reading a CV is AI; filling one in by hand isn't, so that stays.
  const aiEnabled = useAiEnabled();
  const handleError = useErrorHandler();
  const inputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [starting, setStarting] = useState(false);

  async function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files ?? []).filter((f) => f.type === "application/pdf");
    if (!pdfs.length) {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    setStarting(true);
    try {
      for (const file of pdfs) {
        const { runId } = await applicantsApi.startExtract(file);
        cvImportFiles.set(runId, file);
      }
    } catch (e) {
      handleError(e);
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        {aiEnabled && (
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={starting}
            aria-label={t("uploadCv")}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            <span className="hidden md:inline">{t("uploadCv")}</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => manualInputRef.current?.click()}
          aria-label={t("fillManually")}
        >
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
          if (!file) return;
          const key = crypto.randomUUID();
          cvImportFiles.set(key, file);
          router.push(`/hr/cv-review?file=${key}`);
        }}
      />
    </>
  );
}
