"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { AiThinking } from "@/components/ai/AiThinking";
import { aiRunState, parseJson, useAiRun } from "@/components/ai/use-ai-run";
import { blankCvFallbackForm, CvFallbackModal } from "@/components/applicants/CvFallbackModal";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useNow } from "@/hooks/use-now";
import { type CvExtractOutput, useApplicantsApi } from "@/lib/applicants-api";
import { cvImportFiles } from "@/lib/cv-import-files";

const WINDOW_MS = 86_400_000;

function CvImportRow({ runId, index }: { runId: Id<"aiRuns">; index: number }) {
  const t = useTranslations("Applicants");
  const ta = useTranslations("Ai");
  const router = useRouter();
  const applicantsApi = useApplicantsApi();
  const addDocument = useMutation(api.applicants.addDocument);
  const handleError = useErrorHandler();
  const view = useAiRun<CvExtractOutput>({ runId }, parseJson);
  const [busy, setBusy] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);

  const file = cvImportFiles.get(runId);
  const result = view.state === "done" ? view.result : null;
  const created = result?.kind === "created" ? result : null;
  const duplicate = result?.kind === "duplicate" ? result : null;
  const failed =
    view.state === "error" || view.state === "interrupted" || view.state === "cancelled";

  async function act(run: () => Promise<Id<"applicants">>) {
    setBusy(true);
    try {
      const applicantId = await run();
      view.markSeen();
      router.push(`/hr/${applicantId}/uebersicht`);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const title = created
    ? t("cvImportCreated", { name: created.name })
    : duplicate
      ? t("cvImportDuplicate", { name: duplicate.extractedFields.name })
      : (file?.name ?? t("cvImportUnnamed"));

  return (
    <li
      className="ai-rise flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
      style={{ ["--i" as string]: index }}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {view.state === "working" ? (
          <AiThinking
            className="text-xs [&_svg]:hidden"
            phase={view.run?.phase}
            elapsedSec={view.elapsedSec}
          />
        ) : duplicate ? (
          <p className="text-xs text-muted-foreground">
            {t("cvImportDuplicateBody", {
              field: t(`duplicateMatchedOn.${duplicate.duplicate.matchedOn}`),
            })}
          </p>
        ) : created ? (
          <p className="truncate text-xs text-muted-foreground">{created.fileName}</p>
        ) : failed ? (
          <p className="text-xs text-muted-foreground">
            {view.state === "error"
              ? ta(aiErrorKey(view.run?.errorCode ?? null))
              : ta(`state.${view.state}`)}
            {!file && ` · ${t("cvImportManualHint")}`}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {created && (
          <Button size="xs" onClick={() => void act(async () => created.applicantId)}>
            {t("cvImportOpen")}
          </Button>
        )}
        {duplicate && (
          <>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await addDocument({
                    applicantId: duplicate.duplicate.applicantId,
                    storageId: duplicate.pendingStorageId,
                    fileName: duplicate.fileName,
                  });
                  toast.success(t("duplicateAttached", { name: duplicate.duplicate.name }));
                  return duplicate.duplicate.applicantId;
                })
              }
            >
              {t("duplicateAttach")}
            </Button>
            <Button
              size="xs"
              disabled={busy}
              onClick={() =>
                void act(async () => (await applicantsApi.createAnyway(runId)).applicantId)
              }
            >
              {t("duplicateCreateNew")}
            </Button>
          </>
        )}
        {failed && file && (
          <Button size="xs" variant="outline" onClick={() => setManualFile(file)}>
            {t("fillManually")}
          </Button>
        )}
        {view.state !== "working" && (
          <button
            type="button"
            aria-label={ta("dismiss")}
            onClick={view.markSeen}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {manualFile && (
        <CvFallbackModal
          open
          onOpenChange={(open) => {
            if (!open) setManualFile(null);
          }}
          mode="create"
          file={manualFile}
          initialValues={blankCvFallbackForm()}
          onSaved={(applicantId) => {
            setManualFile(null);
            view.markSeen();
            router.push(`/hr/${applicantId}/uebersicht`);
          }}
        />
      )}
    </li>
  );
}

/**
 * Every CV dropped in during the last day that nobody has dealt with yet —
 * still being read, added, or waiting on a duplicate decision. Reads from
 * the runs themselves, so a refresh or a second tab shows the same list.
 */
export function CvImportTray() {
  const t = useTranslations("Applicants");
  const ta = useTranslations("Ai");
  const runs = useQuery(api.aiRuns.recent, { kind: "cvExtract", limit: 15 });
  const now = useNow(true, 5_000);

  const visible = (runs ?? []).filter((r) => !r.seenAt && r.startedAt > now - WINDOW_MS);
  if (!visible.length) return null;

  const working = visible.filter((r) => aiRunState(r, now) === "working").length;

  return (
    <section
      data-working={working > 0}
      className="ai-orbit rounded-2xl border border-border/60 p-4"
      style={{
        backgroundColor: "var(--card)",
        backgroundImage:
          "radial-gradient(30rem 12rem at 0% 0%, color-mix(in oklch, var(--ai-2) 13%, transparent), transparent 70%)",
      }}
    >
      <div className="flex items-start gap-3">
        <span className="ai-edge flex size-9 shrink-0 items-center justify-center rounded-xl">
          <AiGlyph working={working > 0} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em]">
            <span className="ai-text">{ta("eyebrow")}</span>
            <span className="text-muted-foreground"> · {t("cvImportEyebrow")}</span>
          </p>
          <h3 className="mt-0.5 font-display text-lg font-bold tracking-tight">
            {working > 0
              ? t("cvImportWorkingTitle", { count: working })
              : t("cvImportAttentionTitle", { count: visible.length })}
          </h3>
          {working > 0 && <p className="text-sm text-muted-foreground">{t("cvImportBody")}</p>}
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border/60">
        {visible.map((run, index) => (
          <CvImportRow key={run._id} runId={run._id} index={index} />
        ))}
      </ul>
    </section>
  );
}
