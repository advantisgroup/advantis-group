"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EntryDetailModal } from "@/components/applicants/EntryDetailModal";
import { formatIsoDate } from "@/lib/format";

export function EmailDetailModal({
  applicantId,
  email,
}: {
  applicantId: Id<"applicants">;
  email: ApplicantDetail["emails"][number];
}) {
  const t = useTranslations("Applicants");
  const removeEmail = useMutation(api.hr.applicants.removeEmail);

  return (
    <EntryDetailModal
      href={`/hr/${applicantId}/emails/${email._id}`}
      title={email.subject ?? t(`emailKategorie.${email.kategorie}`)}
      description={
        email.sentFrom
          ? `${t(`emailKategorie.${email.kategorie}`)} · ${t("emailSentFrom", { from: email.sentFrom })} · ${formatIsoDate(email.datum, "de-DE")}`
          : formatIsoDate(email.datum, "de-DE")
      }
      note={email.notiz}
      onRemove={() => removeEmail({ emailId: email._id })}
    />
  );
}
