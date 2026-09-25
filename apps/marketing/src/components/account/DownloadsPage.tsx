"use client";

import { Download, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Consents } from "@/lib/inquiries-server";

import { AccountBackLink } from "./AccountNav";
import { type Checkpoint, CheckpointNote, Checkpoints } from "./Checkpoints";
import { useInquiryFormat } from "./inquiry-format";

type Lead = Consents["whitepaper"][number];

/** The whitepaper, for anyone whose request went through — any time, no mail needed. */
export function DownloadsPage({ consents }: { consents: Consents | null }) {
  const t = useTranslations("account.downloads");
  const format = useInquiryFormat();
  const leads = consents?.whitepaper ?? [];

  const steps = (lead: Lead): Checkpoint[] => {
    const at = (value?: number) => (value ? format.dateTime.format(value) : undefined);
    return [
      { key: "requested", label: t("steps.requested"), meta: at(lead.requestedAt), state: "done" },
      {
        key: "confirmed",
        label: t("steps.confirmed"),
        meta: lead.verifiedVia === "account" ? t("viaAccount") : at(lead.confirmedAt),
        state: lead.status === "confirmed" ? "done" : lead.linkExpired ? "failed" : "current",
      },
      {
        key: "sent",
        label: t("steps.sent"),
        meta: at(lead.deliveredAt),
        state: lead.delivered ? "done" : lead.deliveryFailed ? "failed" : "upcoming",
      },
    ];
  };

  return (
    <div className="max-w-3xl">
      <AccountBackLink />
      <Display as="h1" size="md">
        {t("title")}
      </Display>

      {leads.length === 0 ? (
        <div className="mt-10 border-y border-rule py-8">
          <p className="text-[15px] text-foreground">{t("empty")}</p>
          <Button asChild size="sm" shape="pill" className="mt-5">
            <Link href="/whitepaper">{t("get")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-10 space-y-10">
          {leads.map((lead) => (
            <li key={lead.email} className="border-t border-rule pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[15px] font-medium text-foreground">{t("whitepaper")}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t("pdfFor", { email: lead.email })}
                    </p>
                  </div>
                </div>
                {lead.status === "confirmed" ? (
                  <Button asChild size="sm" variant="outline" shape="pill">
                    <a href="/api/account/downloads/whitepaper" download>
                      <Download />
                      {t("download")}
                    </a>
                  </Button>
                ) : null}
              </div>
              <Checkpoints label={t("whitepaper")} steps={steps(lead)} className="mt-6">
                {lead.status === "pending" ? (
                  <CheckpointNote
                    tone={lead.linkExpired ? "failed" : "neutral"}
                    title={lead.linkExpired ? t("expired.title") : t("pending.title")}
                    action={
                      lead.linkExpired ? (
                        <Button asChild size="sm" variant="outline" shape="pill">
                          <Link href="/whitepaper">{t("expired.cta")}</Link>
                        </Button>
                      ) : null
                    }
                  >
                    {lead.linkExpired
                      ? t("expired.body")
                      : t("pending.body", { email: lead.email })}
                  </CheckpointNote>
                ) : lead.deliveryFailed ? (
                  <CheckpointNote tone="failed" title={t("failed.title")}>
                    {t("failed.body")}
                  </CheckpointNote>
                ) : null}
              </Checkpoints>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
