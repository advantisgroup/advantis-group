"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Mail, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EmailDialog } from "@/components/applicants/EntryDialogs";
import { EntryRow } from "@/components/applicants/EntryRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Emails({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeEmail = useMutation(api.applicants.removeEmail);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
          <p className="text-sm font-semibold">
            {t("emailHistory")}
            <span className="ml-1.5 text-muted-foreground">
              ({applicant.emails.length})
            </span>
          </p>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="size-4" />
            {t("logEmail")}
          </Button>
        </div>
        <CardContent className="p-0">
          {applicant.emails.length === 0 ? (
            <EmptyState
              icon={<Mail />}
              title={t("noEmailsYet")}
              className="rounded-none border-none"
              action={
                <Button size="sm" onClick={() => setLogOpen(true)}>
                  <Plus className="size-4" />
                  {t("logEmail")}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border/70">
              {applicant.emails.map(m => (
                <EntryRow
                  key={m._id}
                  href={`/applicants/${applicant._id}/emails/${m._id}`}
                  icon={Mail}
                  title={t(`emailKategorie.${m.kategorie}`)}
                  meta={formatIsoDate(m.datum, "de-DE")}
                  note={m.notiz}
                  onDelete={() =>
                    removeEmail({ emailId: m._id }).catch(handleError)
                  }
                  deleteLabel={t("deleteEntry")}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <EmailDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        applicantId={applicant._id}
      />
    </div>
  );
}
