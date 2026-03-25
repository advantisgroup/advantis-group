"use client";

import { useEffect, useMemo, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import {
  AlertCircle,
  Building2,
  Clock3,
  Mail,
  MessageSquareText,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type ContactSubmissionRecord } from "@/types/contact";

export const ContactSubmissionsPage = () => {
  const locale = useLocale();
  const t = useTranslations("auth.submissions");
  const { openUserProfile } = useClerk();
  const [submissions, setSubmissions] = useState<ContactSubmissionRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setErrorDetail("");
        const response = await fetch("/api/submissions", { cache: "no-store" });

        if (!response.ok) {
          let reason = `Failed with status ${response.status}`;

          try {
            const errorData = (await response.json()) as {
              error?: string;
              code?: string;
              detail?: string;
            };

            if (errorData.detail) {
              reason = errorData.detail;
            } else if (errorData.error) {
              reason = errorData.error;
            }

            if (errorData.code) {
              reason = `${reason} (code: ${errorData.code})`;
            }
          } catch {
            // Keep fallback reason when response body is not JSON.
          }

          throw new Error(reason);
        }

        const data = (await response.json()) as {
          submissions?: ContactSubmissionRecord[];
        };

        setSubmissions(data.submissions ?? []);
        setStatus("ready");
      } catch (error) {
        console.error("Failed to load contact submissions", error);
        setErrorDetail(
          error instanceof Error
            ? error.message
            : "Unknown error while loading submissions."
        );
        setStatus("error");
      }
    };

    void load();
  }, []);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale]
  );

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-background px-4 py-28">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-advantis/30 bg-advantis/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-advantis">
            {t("badge")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/contact" locale={locale}>
              {t("newSubmissionCta")}
            </Link>
          </Button>
          <Button type="button" onClick={() => void openUserProfile()}>
            {t("accountCta")}
          </Button>
        </div>

        {status === "loading" ? (
          <div className="rounded-[2rem] border border-border bg-card/70 p-8 text-sm text-muted-foreground shadow-2xl shadow-black/20 backdrop-blur">
            {t("loading")}
          </div>
        ) : status === "error" ? (
          <div className="rounded-[2rem] border border-red-500/30 bg-red-500/5 p-8 shadow-2xl shadow-black/20 backdrop-blur">
            <div className="flex items-start gap-3 text-red-200">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">{t("errorTitle")}</p>
                <p className="mt-1 text-sm text-red-100/80">
                  {t("errorDescription")}
                </p>
                {errorDetail ? (
                  <p className="mt-2 rounded-md border border-red-300/20 bg-black/20 px-3 py-2 font-mono text-xs text-red-100/90">
                    {errorDetail}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-[2rem] border border-border bg-card/70 p-8 shadow-2xl shadow-black/20 backdrop-blur">
            <p className="text-lg font-medium text-foreground">
              {t("emptyTitle")}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {submissions.map(submission => (
              <article
                key={submission._id}
                className="rounded-[2rem] border border-border bg-card/70 p-6 shadow-2xl shadow-black/20 backdrop-blur"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-advantis/30 bg-advantis/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-advantis">
                        {t(`types.${submission.submissionType}`)}
                      </span>
                      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                        {t(`status.${submission.status}`)}
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {submission.subject}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {formatter.format(new Date(submission.sentAt))}
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-[320px]">
                    <div className="flex items-start gap-2">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">
                          {submission.email}
                        </p>
                        <p>{t("contactEmail")}</p>
                      </div>
                    </div>
                    {submission.company ? (
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">
                            {submission.company}
                          </p>
                          <p>{t("company")}</p>
                        </div>
                      </div>
                    ) : null}
                    {submission.desiredDateTime ? (
                      <div className="flex items-start gap-2">
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">
                            {submission.desiredDateTime}
                          </p>
                          <p>{t("desiredTime")}</p>
                        </div>
                      </div>
                    ) : null}
                    {submission.accountEmail ? (
                      <div className="flex items-start gap-2">
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">
                            {submission.accountEmail}
                          </p>
                          <p>{t("accountEmail")}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 border-t border-border/70 pt-5 lg:grid-cols-[1.5fr_1fr]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {t("message")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {submission.message}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {submission.topic ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {t("topic")}
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {submission.topic}
                        </p>
                      </div>
                    ) : null}
                    {submission.notes ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {t("notes")}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                          {submission.notes}
                        </p>
                      </div>
                    ) : null}
                    {submission.error ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {t("deliveryIssue")}
                        </p>
                        <p className="mt-1 text-sm text-red-300">
                          {submission.error}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
