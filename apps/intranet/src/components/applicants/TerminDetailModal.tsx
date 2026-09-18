"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EntryDetailModal } from "@/components/applicants/EntryDetailModal";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function TerminDetailModal({
  applicantId,
  termin,
}: {
  applicantId: Id<"applicants">;
  termin: ApplicantDetail["termine"][number];
}) {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const convertTermin = useMutation(api.hr.applicants.convertTermin);
  const removeTermin = useMutation(api.hr.applicants.removeTermin);
  const handleError = useErrorHandler();

  function handleConvert() {
    convertTermin({ terminId: termin._id })
      .then(() => {
        toast.success(t("terminConverted"));
        router.back();
      })
      .catch(handleError);
  }

  return (
    <EntryDetailModal
      href={`/hr/${applicantId}/termine/${termin._id}`}
      title={t(`terminTyp.${termin.typ}`)}
      description={`${formatIsoDate(termin.datum, "de-DE")} · ${termin.uhrzeit} · ${t(`terminArt.${termin.art}`)}`}
      note={termin.notiz}
      onRemove={() => removeTermin({ terminId: termin._id })}
      confirmTitle={t("deleteTermin")}
      confirmDescription={t("deleteTerminConfirm")}
      extraFooter={
        !termin.uebernommen ? (
          <Button variant="outline" onClick={handleConvert}>
            {t("markAsHappened")}
          </Button>
        ) : undefined
      }
    >
      {termin.uebernommen && (
        <p className="text-xs font-medium text-success">{t("terminConverted")}</p>
      )}
    </EntryDetailModal>
  );
}
