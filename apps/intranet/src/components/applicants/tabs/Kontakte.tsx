"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { PhoneCall, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { KontaktDialog } from "@/components/applicants/EntryDialogs";
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
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {t("firstContactHint")}
        </div>
      )}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("contactHistory")}</p>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="size-4" />
              {t("logContact")}
            </Button>
          </div>
          {applicant.kontakte.length === 0 ? (
            <EmptyState icon={<PhoneCall />} title={t("noContactsYet")} />
          ) : (
            applicant.kontakte.map(k => (
              <Link
                key={k._id}
                href={`/applicants/${applicant._id}/kontakte/${k._id}`}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t(`kontaktArt.${k.art}`)} ·{" "}
                    {formatIsoDate(k.datum, "de-DE")}
                  </p>
                  {k.notiz && (
                    <p className="mt-1 text-muted-foreground">{k.notiz}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("deleteEntry")}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeKontakt({ kontaktId: k._id }).catch(handleError);
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
      <KontaktDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        applicantId={applicant._id}
        showFirstContactHint={applicant.status === "neu"}
      />
    </div>
  );
}
