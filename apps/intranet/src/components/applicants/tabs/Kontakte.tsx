"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Info, PhoneCall, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { KontaktDialog } from "@/components/applicants/EntryDialogs";
import { EntryRow } from "@/components/applicants/EntryRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Kontakte({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeKontakt = useMutation(api.applicants.removeKontakt);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-5">
      {applicant.status === "neu" && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          {t("firstContactHint")}
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
          <p className="text-sm font-semibold">
            {t("contactHistory")}
            <span className="ml-1.5 text-muted-foreground">({applicant.kontakte.length})</span>
          </p>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="size-4" />
            {t("logContact")}
          </Button>
        </div>
        <CardContent className="p-0">
          {applicant.kontakte.length === 0 ? (
            <EmptyState
              icon={<PhoneCall />}
              title={t("noContactsYet")}
              className="rounded-none border-none"
              action={
                <Button size="sm" onClick={() => setLogOpen(true)}>
                  <Plus className="size-4" />
                  {t("logContact")}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border/70">
              {applicant.kontakte.map((k) => (
                <EntryRow
                  key={k._id}
                  href={`/applicants/${applicant._id}/kontakte/${k._id}`}
                  icon={PhoneCall}
                  title={t(`kontaktArt.${k.art}`)}
                  meta={formatIsoDate(k.datum, "de-DE")}
                  note={k.notiz}
                  onDelete={() => removeKontakt({ kontaktId: k._id }).catch(handleError)}
                  deleteLabel={t("deleteEntry")}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <KontaktDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        applicantId={applicant._id}
        showFirstContactHint={applicant.status === "neu"}
      />
    </div>
  );
}
