"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { CopyLinkButton } from "@/components/applicants/CopyLinkButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function InterviewDetailModal({
  applicantId,
  interview,
}: {
  applicantId: Id<"applicants">;
  interview: ApplicantDetail["interviews"][number];
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const confirm = useConfirm();
  const removeInterview = useMutation(api.applicants.removeInterview);
  const handleError = useErrorHandler();

  function close() {
    router.back();
  }

  async function handleRemove() {
    const ok = await confirm({
      title: t("deleteEntry"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeInterview({ interviewId: interview._id }).then(close).catch(handleError);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pt-6 pr-12">
          <DialogTitle>
            {t("interviewOn", {
              date: formatIsoDate(interview.datum, "de-DE"),
            })}
          </DialogTitle>
          {interview.interviewer && (
            <DialogDescription className="mt-1">{interview.interviewer}</DialogDescription>
          )}
        </div>
        <div className="space-y-3 px-6 py-5">
          {interview.notiz && <p className="text-sm">{interview.notiz}</p>}
          <CopyLinkButton
            href={`/hr/${applicantId}/interviews/${interview._id}`}
            className="-ml-3"
          />
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleRemove()}
          >
            {tc("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
