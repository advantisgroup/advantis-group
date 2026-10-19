"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Mail, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EmailDialog } from "@/components/applicants/EntryDialogs";
import { EntryListCard } from "@/components/applicants/EntryListCard";
import { SendEmailDialog } from "@/components/applicants/SendEmailDialog";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Emails({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeEmail = useMutation(api.hr.applicants.removeEmail);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  return (
    <>
      <EntryListCard
        historyLabel={t("emailHistory")}
        logLabel={t("logEmail")}
        onLog={() => setLogOpen(true)}
        secondaryAction={
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setSendOpen(true)}
          >
            <Send className="size-4" />
            {t("sendEmail")}
          </Button>
        }
        emptyIcon={<Mail />}
        emptyLabel={t("noEmailsYet")}
        deleteLabel={t("deleteEntry")}
        editLabel={t("editEntry")}
        rows={applicant.emails.map((m) => ({
          _id: m._id,
          href: `/hr/${applicant._id}/emails/${m._id}`,
          icon: m.sentFrom ? Send : Mail,
          title: m.sentFrom
            ? `${t(`emailKategorie.${m.kategorie}`)} · ${t("emailSentLabel")}`
            : t(`emailKategorie.${m.kategorie}`),
          meta: formatIsoDate(m.datum, "de-DE"),
          note: m.subject ?? m.notiz,
          onDelete: () => removeEmail({ emailId: m._id }).catch(handleError),
          edit: { kind: "email", entry: m },
        }))}
      />
      <EmailDialog open={logOpen} onOpenChange={setLogOpen} applicantId={applicant._id} />
      <SendEmailDialog applicant={applicant} open={sendOpen} onOpenChange={setSendOpen} />
    </>
  );
}
