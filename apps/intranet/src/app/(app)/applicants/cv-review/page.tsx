"use client";

import { type ReactNode, use, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useConvex, useQuery } from "convex/react";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiRunCard } from "@/components/ai/AiRunCard";
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

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6">{children}</div>;
}

function Notice({ message, children }: { message: string; children: ReactNode }) {
  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex justify-center gap-2">{children}</div>
        </CardContent>
      </Card>
    </Centered>
  );
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
  const ta = useTranslations("Ai");
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
  const [fileFailed, setFileFailed] = useState(false);

  const read = readOf(run.result);
  const reading = !!runId && run.state === "working";
  const waitingOnRun =
    !!runId &&
    (run.loading || reading || (run.state === "done" && run.text === null && !run.textFailed));
  const stagedId = read?.storageId;
  const stagedName = read?.fileName;

  useEffect(() => {
    if (file !== undefined || fileFailed || waitingOnRun) return;
    if (!stagedId || !stagedName) {
      setFile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const url = await convex.query(api.applicants.stagedFileUrl, { storageId: stagedId });
      if (!url) {
        if (!cancelled) setFile(null);
        return;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
      const blob = await res.blob();
      if (!cancelled) setFile(new File([blob], stagedName, { type: "application/pdf" }));
    })().catch(() => {
      // A dropped connection isn't the same as the PDF being gone — keep the
      // difference so the page can offer a retry instead of a dead end.
      if (!cancelled) setFileFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [convex, file, fileFailed, waitingOnRun, stagedId, stagedName]);

  const backHref = applicantId ? `/hr/${applicantId}/dokumente` : "/hr/list";
  const back = (
    <Button variant="secondary" size="sm" asChild>
      <Link href={backHref}>{tc("back")}</Link>
    </Button>
  );

  if (reading) {
    return (
      <Centered>
        <div className="w-full max-w-md space-y-3">
          <AiRunCard view={run} />
          <div className="flex justify-center">{back}</div>
        </div>
      </Centered>
    );
  }

  if (fileFailed || (run.textFailed && run.state === "done" && run.text === null)) {
    return (
      <Notice message={t("cvReviewFileLoadFailed")}>
        {back}
        <Button
          size="sm"
          onClick={() => {
            if (run.textFailed) run.retryText();
            setFileFailed(false);
            setFile((current) => current ?? undefined);
          }}
        >
          <RotateCcw />
          {ta("retry")}
        </Button>
      </Notice>
    );
  }

  if ((applicantId && applicant === undefined) || waitingOnRun || file === undefined) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (!file || applicant === null) {
    return (
      <Notice
        message={applicant === null ? t("cvReviewApplicantMissing") : t("cvReviewFileMissing")}
      >
        {back}
      </Notice>
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
