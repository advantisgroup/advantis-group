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

export function KontaktDetailModal({
  applicantId,
  kontakt,
}: {
  applicantId: Id<"applicants">;
  kontakt: ApplicantDetail["kontakte"][number];
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const confirm = useConfirm();
  const removeKontakt = useMutation(api.applicants.removeKontakt);
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
    removeKontakt({ kontaktId: kontakt._id }).then(close).catch(handleError);
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && close()}
      title={t(`kontaktArt.${kontakt.art}`)}
      description={formatIsoDate(kontakt.datum, "de-DE")}
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
      {kontakt.notiz && <p className="text-sm">{kontakt.notiz}</p>}
      <CopyLinkButton href={`/hr/${applicantId}/kontakte/${kontakt._id}`} className="-ml-3" />
    </ResponsiveDialog>
  );
}
