"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EmailDialog } from "@/components/applicants/EntryDialogs";
import { EntryListCard } from "@/components/applicants/EntryListCard";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Emails({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeEmail = useMutation(api.hr.applicants.removeEmail);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <>
      <EntryListCard
        historyLabel={t("emailHistory")}
        logLabel={t("logEmail")}
        onLog={() => setLogOpen(true)}
        emptyIcon={<Mail />}
        emptyLabel={t("noEmailsYet")}
        deleteLabel={t("deleteEntry")}
        rows={applicant.emails.map((m) => ({
          _id: m._id,
          href: `/hr/${applicant._id}/emails/${m._id}`,
          icon: Mail,
          title: t(`emailKategorie.${m.kategorie}`),
          meta: formatIsoDate(m.datum, "de-DE"),
          note: m.notiz,
          onDelete: () => removeEmail({ emailId: m._id }).catch(handleError),
        }))}
      />
      <EmailDialog open={logOpen} onOpenChange={setLogOpen} applicantId={applicant._id} />
    </>
  );
}
