"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EntryDetailModal } from "@/components/applicants/EntryDetailModal";
import { formatIsoDate } from "@/lib/format";

export function KontaktDetailModal({
  applicantId,
  kontakt,
}: {
  applicantId: Id<"applicants">;
  kontakt: ApplicantDetail["kontakte"][number];
}) {
  const t = useTranslations("Applicants");
  const removeKontakt = useMutation(api.applicants.removeKontakt);

  return (
    <EntryDetailModal
      href={`/hr/${applicantId}/kontakte/${kontakt._id}`}
      title={t(`kontaktArt.${kontakt.art}`)}
      description={formatIsoDate(kontakt.datum, "de-DE")}
      note={kontakt.notiz}
      onRemove={() => removeKontakt({ kontaktId: kontakt._id })}
    />
  );
}
