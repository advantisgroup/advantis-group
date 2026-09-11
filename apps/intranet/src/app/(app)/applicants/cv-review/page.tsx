"use client";

import { use, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import {
  applicantToCvValues,
  blankCvReviewValues,
  CvReviewForm,
  withExtracted,
} from "@/components/applicants/CvReviewForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type CvExtractOutput, type CvRescanOutput } from "@/lib/applicants-api";
import { cvImportFiles } from "@/lib/cv-import-files";

type RunOutput = CvExtractOutput | CvRescanOutput;

/** Where a finished read left its PDF and what it found, if it kept either. */
function readOf(output: RunOutput | null) {
  if (!output) return null;
  if (!("kind" in output)) return output;
  if (output.kind !== "duplicate") return null;
  return {
    extractedFields: output.extractedFields,
    storageId: output.pendingStorageId,
    fileName: output.fileName,
  };
}

/**
 * Filling in or checking an applicant against their CV. `run` is a CV read to
 * prefill from (and to fetch the PDF back from after a refresh), `file` a PDF
 * picked in this tab, and `applicant` who to update instead of creating.
 */
export default function CvReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; file?: string; applicant?: string }>;
}) {
  const params = use(searchParams);
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const convex = useConvex();
  const runId = (params.run ?? null) as Id<"aiRuns"> | null;
  const applicantId = (params.applicant ?? null) as Id<"applicants"> | null;
  const fileKey = params.file ?? params.run;

  const applicant = useQuery(api.applicants.get, applicantId ? { applicantId } : "skip");
  const run = useAiRun<RunOutput>({ runId }, parseJson);
  // undefined while it might still come back from storage, null once it won't.
  const [file, setFile] = useState<File | null | undefined>(
    () => (fileKey ? cvImportFiles.get(fileKey) : null) ?? undefined,
  );

  const read = readOf(run.result);
  const waitingOnRun =
    !!runId &&
    (run.loading || run.state === "working" || (run.state === "done" && run.text === null));
  const stagedId = read?.storageId;
  const stagedName = read?.fileName;

  useEffect(() => {
    if (file !== undefined || waitingOnRun) return;
    if (!stagedId || !stagedName) {
      setFile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const url = await convex.query(api.applicants.stagedFileUrl, { storageId: stagedId });
      const blob = url ? await (await fetch(url)).blob() : null;
      if (cancelled) return;
      setFile(blob ? new File([blob], stagedName, { type: "application/pdf" }) : null);
    })().catch(() => {
      if (!cancelled) setFile(null);
    });
    return () => {
      cancelled = true;
    };
  }, [convex, file, waitingOnRun, stagedId, stagedName]);

  const backHref = applicantId ? `/hr/${applicantId}/dokumente` : "/hr/list";

  if ((applicantId && applicant === undefined) || waitingOnRun || file === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!file || applicant === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {applicant === null ? t("cvReviewApplicantMissing") : t("cvReviewFileMissing")}
            </p>
            <Button variant="secondary" size="sm" asChild>
              <Link href={backHref}>{tc("back")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const base = applicant ? applicantToCvValues(applicant) : blankCvReviewValues();
  const prefill = read ? withExtracted(base, read.extractedFields) : { values: base, origins: {} };

  return (
    <CvReviewForm
      key={fileKey ?? "manual"}
      mode={applicantId ? "update" : "create"}
      applicantId={applicantId ?? undefined}
      file={file}
      initialValues={prefill.values}
      initialOrigins={prefill.origins}
      pendingStorageId={stagedId}
      draftKey={runId ?? undefined}
      backHref={backHref}
      onSaved={(id) => {
        run.markSeen();
        router.push(applicantId ? `/hr/${id}/dokumente` : `/hr/${id}/uebersicht`);
      }}
    />
  );
}
