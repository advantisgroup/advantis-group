"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  KONTAKT_ARTEN,
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
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Kontakte({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addKontakt = useMutation(api.applicants.addKontakt);
  const removeKontakt = useMutation(api.applicants.removeKontakt);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [art, setArt] = useState<(typeof KONTAKT_ARTEN)[number]>("telefon");
  const [notiz, setNotiz] = useState("");

  function save() {
    addKontakt({
      applicantId: applicant._id,
      datum,
      art,
      notiz: notiz.trim() || undefined,
    })
      .then(() => setNotiz(""))
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      {applicant.status === "neu" && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {t("firstContactHint")}
        </div>
      )}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logContact")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
            />
            <Select value={art} onValueChange={v => setArt(v as typeof art)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KONTAKT_ARTEN.map(a => (
                  <SelectItem key={a} value={a}>
                    {t(`kontaktArt.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save}>{t("saveContact")}</Button>
          </div>
          <Textarea
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("contactNotePlaceholder")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("contactHistory")}</p>
          {applicant.kontakte.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noContactsYet")}
            </p>
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
    </div>
  );
}
