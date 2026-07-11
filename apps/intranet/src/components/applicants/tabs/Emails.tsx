"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  EMAIL_KATEGORIEN,
  today,
} from "@/components/applicants/applicant-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Emails({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addEmail = useMutation(api.applicants.addEmail);
  const removeEmail = useMutation(api.applicants.removeEmail);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [kategorie, setKategorie] =
    useState<(typeof EMAIL_KATEGORIEN)[number]>("sonstiges");
  const [notiz, setNotiz] = useState("");

  function save() {
    addEmail({
      applicantId: applicant._id,
      datum,
      kategorie,
      notiz: notiz.trim() || undefined,
    })
      .then(() => setNotiz(""))
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logEmail")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
            />
            <Select
              value={kategorie}
              onValueChange={v => setKategorie(v as typeof kategorie)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_KATEGORIEN.map(k => (
                  <SelectItem key={k} value={k}>
                    {t(`emailKategorie.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save}>{t("saveEmail")}</Button>
          </div>
          <Input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("emailNotePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("emailDoesNotCountHint")}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("emailHistory")}</p>
          {applicant.emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEmailsYet")}</p>
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
    </div>
  );
}
