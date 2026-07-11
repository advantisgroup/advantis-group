"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useApplicantsApi } from "@/lib/applicants-api";

/** PDF upload → Claude extraction → new "Neue Bewerber" record, then navigate there. */
export function UploadCvButton() {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const api = useApplicantsApi();
  const handleError = useErrorHandler();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files ?? []).filter(
      f => f.type === "application/pdf"
    );
    if (!pdfs.length) {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    for (const file of pdfs) {
      setUploading(file.name);
      try {
        const { applicantId } = await api.extract(file);
        toast.success(t("uploadSuccess", { name: file.name }));
        router.push(`/applicants/${applicantId}`);
      } catch (e) {
        handleError(e, t("uploadFailed", { name: file.name }));
      }
    }
    setUploading(null);
  }

  return (
    <>
      <Button onClick={() => inputRef.current?.click()} disabled={!!uploading}>
        <UploadCloud className="size-4" />
        {uploading ? t("uploading") : t("uploadCv")}
      </Button>
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
    </>
  );
}
