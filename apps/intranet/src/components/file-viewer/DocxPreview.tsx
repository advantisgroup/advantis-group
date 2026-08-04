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
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
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

  if (!html) {
    return <Loader2 className="size-6 animate-spin text-white/70" />;
  }

  return (
    <div className="h-full w-full max-w-3xl overflow-auto rounded-lg bg-white p-8 shadow-2xl">
      <div className="docx-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
