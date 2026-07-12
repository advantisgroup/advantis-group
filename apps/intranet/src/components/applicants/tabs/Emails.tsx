"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Mail, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EmailDialog } from "@/components/applicants/EntryDialogs";
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
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("emailHistory")}</p>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="size-4" />
              {t("logEmail")}
            </Button>
          </div>
          {applicant.emails.length === 0 ? (
            <EmptyState icon={<Mail />} title={t("noEmailsYet")} />
          ) : (
            applicant.emails.map(m => (
              <Link
                key={m._id}
                href={`/applicants/${applicant._id}/emails/${m._id}`}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatIsoDate(m.datum, "de-DE")} ·{" "}
                    {t(`emailKategorie.${m.kategorie}`)}
                  </p>
                  {m.notiz && (
                    <p className="mt-1 text-muted-foreground">{m.notiz}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("deleteEntry")}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeEmail({ emailId: m._id }).catch(handleError);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </Link>
            ))
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
