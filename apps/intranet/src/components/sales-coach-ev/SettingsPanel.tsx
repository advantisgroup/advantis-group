"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useEdenApi } from "@/lib/eden";
import { saveKpiText, useSalesCoachSettings } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

const MAX_CHARS = 5000;

export function SettingsPanel() {
  const t = useTranslations("SalesCoachEv");
  const eden = useEdenApi();
  const handleError = useErrorHandler();
  const { kpiText, refresh } = useSalesCoachSettings();
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (kpiText) setStatus(t("kpiLoaded"));
  }, [kpiText, t]);

  const handleFile = async (file: File) => {
    setStatus(t("kpiReading"));
    try {
      const raw = await file.text();
      // Same naive text extraction as the original tool — real PDF/Word
      // binary content won't extract cleanly, only plain text does.
      const cleaned = raw
        .replace(/[^\x20-\x7EÀ-ɏ\n\r\t]/g, "")
        .trim()
        .slice(0, MAX_CHARS);
      await saveKpiText(eden, cleaned);
      refresh();
      setStatus(t("kpiLoadedNamed", { name: file.name }));
    } catch (err) {
      handleError(err, t("kpiSaveFailed"));
      setStatus(null);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("kpiCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3.5 text-sm text-muted-foreground">{t("kpiCardDescription")}</p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed border-border p-7 text-center transition-colors",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <div className="text-sm font-semibold">{t("kpiDropzoneTitle")}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t("kpiDropzoneSubtitle")}</div>
          </div>
          {status && <div className="mt-2.5 text-[13px] text-muted-foreground">{status}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audioSetupTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {[t("audioStep1"), t("audioStep2"), t("audioStep3")].map((step, i) => (
            <div key={i} className="flex gap-2.5 text-sm text-foreground/85">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-primary bg-primary/10 text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">{t("audioAlternative")}</div>
        </CardContent>
      </Card>
    </div>
  );
}
