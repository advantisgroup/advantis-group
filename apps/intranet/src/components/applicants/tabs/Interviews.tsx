"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  today,
} from "@/components/applicants/applicant-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Interviews({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addInterview = useMutation(api.applicants.addInterview);
  const removeInterview = useMutation(api.applicants.removeInterview);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [interviewer, setInterviewer] = useState("");
  const [notiz, setNotiz] = useState("");

  function save() {
    addInterview({
      applicantId: applicant._id,
      datum,
      interviewer,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        setInterviewer("");
        setNotiz("");
      })
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logInterview")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
            />
            <Input
              placeholder={t("interviewerPlaceholder")}
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
            />
            <Button onClick={save}>{t("saveInterview")}</Button>
          </div>
          <Textarea
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("interviewNotePlaceholder")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("interviewHistory")}</p>
          {applicant.interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noInterviewsYet")}
            </p>
          ) : (
            applicant.interviews.map(iv => (
              <Link
                key={iv._id}
                href={`/applicants/${applicant._id}/interviews/${iv._id}`}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t("interviewOn", {
                      date: formatIsoDate(iv.datum, "de-DE"),
                    })}
                    {iv.interviewer ? ` · ${iv.interviewer}` : ""}
                  </p>
                  {iv.notiz && (
                    <p className="mt-1 text-muted-foreground">{iv.notiz}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("deleteEntry")}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeInterview({ interviewId: iv._id }).catch(handleError);
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
