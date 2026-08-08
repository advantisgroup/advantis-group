"use client";

import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

/** Read-only .docx preview for the global file viewer — converts the file's
 * own bytes to HTML client-side (via mammoth) and renders it on a page-like
 * card, rather than embedding an Office Online iframe (which needs a
 * publicly reachable URL that OneDrive- and storage-origin files don't
 * always have). */
export function DocxPreview({ url }: { url: string }) {
  const t = useTranslations("FileViewer");
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtml(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false);
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then(async (arrayBuffer) => {
        const [mammoth, { default: DOMPurify }] = await Promise.all([
          import("mammoth"),
          import("dompurify"),
        ]);
        const result = await mammoth.convertToHtml({ arrayBuffer });
        // Mammoth doesn't sanitize its own output — a crafted .docx can carry
        // a `javascript:` hyperlink or similar, which would otherwise execute
        // under this origin the moment another user clicks it in the preview.
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return <p className="max-w-sm py-8 text-center text-sm text-white/70">{t("noPreview")}</p>;
  }

  // `html` starts `null` and is only ever set (even to "" for a blank doc)
  // once conversion finishes — checking for `null` specifically (rather than
  // falsy) keeps an empty document from getting stuck on the loading spinner.
  if (html === null) {
    return <Loader2 className="size-6 animate-spin text-white/70" />;
  }

  return (
    <div className="h-full w-full max-w-3xl overflow-auto rounded-lg bg-white p-4 shadow-2xl sm:p-8">
      <div className="docx-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
