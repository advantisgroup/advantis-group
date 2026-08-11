"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Info, PhoneCall } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { KontaktDialog } from "@/components/applicants/EntryDialogs";
import { EntryListCard } from "@/components/applicants/EntryListCard";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Kontakte({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeKontakt = useMutation(api.applicants.removeKontakt);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <>
      <EntryListCard
        hint={
          applicant.status === "neu" ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              {t("firstContactHint")}
            </div>
          ) : undefined
        }
        historyLabel={t("contactHistory")}
        logLabel={t("logContact")}
        onLog={() => setLogOpen(true)}
        emptyIcon={<PhoneCall />}
        emptyLabel={t("noContactsYet")}
        deleteLabel={t("deleteEntry")}
        rows={applicant.kontakte.map((k) => ({
          _id: k._id,
          href: `/hr/${applicant._id}/kontakte/${k._id}`,
          icon: PhoneCall,
          title: t(`kontaktArt.${k.art}`),
          meta: formatIsoDate(k.datum, "de-DE"),
          note: k.notiz,
          onDelete: () => removeKontakt({ kontaktId: k._id }).catch(handleError),
        }))}
      />
      <KontaktDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        applicantId={applicant._id}
        showFirstContactHint={applicant.status === "neu"}
      />
    </>
  );
}
