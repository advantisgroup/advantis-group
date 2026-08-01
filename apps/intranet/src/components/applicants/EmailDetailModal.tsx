"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { CopyLinkButton } from "@/components/applicants/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function EmailDetailModal({
  applicantId,
  email,
}: {
  applicantId: Id<"applicants">;
  email: ApplicantDetail["emails"][number];
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const confirm = useConfirm();
  const removeEmail = useMutation(api.applicants.removeEmail);
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
    removeEmail({ emailId: email._id }).then(close).catch(handleError);
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && close()}
      title={t(`emailKategorie.${email.kategorie}`)}
      description={formatIsoDate(email.datum, "de-DE")}
      footer={
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void handleRemove()}
        >
          {tc("delete")}
        </Button>
      }
    >
      {email.notiz && <p className="text-sm">{email.notiz}</p>}
      <CopyLinkButton href={`/hr/${applicantId}/emails/${email._id}`} className="-ml-3" />
    </ResponsiveDialog>
  );
}
