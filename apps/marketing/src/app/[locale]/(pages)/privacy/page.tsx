"use client";

import { useMemo } from "react";

import { INQUIRY_RETENTION_YEARS } from "@advantis/convex/marketing/inquiry";
import { useTranslations } from "next-intl";

import { LegalLayout } from "@/components/legal/LegalLayout";
import { COMPANY_ADDRESS } from "@/lib/company";

const PROCESSORS = ["vercel", "clerk", "convex", "resend", "upstash"] as const;

export default function Datenschutz() {
  const t = useTranslations("privacy");

  const sections = useMemo(
    () => [
      {
        id: "overview",
        title: t("sections.overview.title"),
        content: (
          <div className="prose prose-base max-w-none">
            <p className="text-foreground/80 leading-relaxed">{t("sections.overview.content")}</p>
          </div>
        ),
      },
      {
        id: "general",
        title: t("sections.general.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">{t("sections.general.content1")}</p>
            <p className="text-foreground/80 leading-relaxed">{t("sections.general.content2")}</p>
          </div>
        ),
      },
      {
        id: "responsible",
        title: t("sections.responsible.title"),
        content: (
          <div className="prose prose-base max-w-none">
            <p className="text-foreground/80 leading-relaxed mb-4">
              {t("sections.responsible.intro")}
            </p>
            <div className="bg-muted/20 p-6 rounded-lg space-y-1">
              <p className="font-semibold text-foreground">advantis GmbH</p>
              <p className="text-foreground/80">Andrea Reichl</p>
              <p>{COMPANY_ADDRESS}</p>
              <p className="text-foreground/80 mt-3">
                E-Mail: {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "collection",
        title: t("sections.collection.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <h3 className="text-xl font-semibold text-foreground">
              {t("sections.collection.subtitle")}
            </h3>
            <p className="text-foreground/80 leading-relaxed">{t("sections.collection.intro")}</p>
            <ul className="list-disc space-y-2 pl-5 text-foreground/80 marker:text-muted-foreground">
              <li>{t("sections.collection.items.ip")}</li>
              <li>{t("sections.collection.items.browser")}</li>
              <li>{t("sections.collection.items.os")}</li>
              <li>{t("sections.collection.items.datetime")}</li>
              <li>{t("sections.collection.items.referrer")}</li>
            </ul>
            <p className="text-foreground/80 leading-relaxed">{t("sections.collection.footer")}</p>
          </div>
        ),
      },
      {
        id: "contact",
        title: t("sections.contact.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">{t("sections.contact.content1")}</p>
            <p className="text-foreground/80 leading-relaxed">{t("sections.contact.content2")}</p>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.contact.content3", { years: INQUIRY_RETENTION_YEARS })}
            </p>
          </div>
        ),
      },
      {
        id: "account",
        title: t("sections.account.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">{t("sections.account.content1")}</p>
            <p className="text-foreground/80 leading-relaxed">{t("sections.account.content2")}</p>
            <p className="text-foreground/80 leading-relaxed">{t("sections.account.content3")}</p>
          </div>
        ),
      },
      {
        id: "whitepaper",
        title: t("sections.whitepaper.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.whitepaper.content1", { years: INQUIRY_RETENTION_YEARS })}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.whitepaper.content2")}
            </p>
          </div>
        ),
      },
      {
        id: "processors",
        title: t("sections.processors.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">{t("sections.processors.intro")}</p>
            <ul className="list-disc space-y-2 pl-5 text-foreground/80 marker:text-muted-foreground">
              {PROCESSORS.map((key) => (
                <li key={key}>{t(`sections.processors.items.${key}`)}</li>
              ))}
            </ul>
            <p className="text-foreground/80 leading-relaxed">{t("sections.processors.footer")}</p>
          </div>
        ),
      },
      {
        id: "analytics",
        title: t("sections.analytics.title"),
        content: (
          <div className="prose prose-base max-w-none">
            <p className="text-foreground/80 leading-relaxed">{t("sections.analytics.content1")}</p>
          </div>
        ),
      },
      {
        id: "rights",
        title: t("sections.rights.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">{t("sections.rights.intro")}</p>
            <h3 className="text-xl font-semibold text-foreground">
              {t("sections.rights.subtitle")}
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-foreground/80 marker:text-muted-foreground">
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.access.title")}
                </strong>{" "}
                {t("sections.rights.items.access.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.rectification.title")}
                </strong>{" "}
                {t("sections.rights.items.rectification.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.deletion.title")}
                </strong>{" "}
                {t("sections.rights.items.deletion.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.restriction.title")}
                </strong>{" "}
                {t("sections.rights.items.restriction.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.objection.title")}
                </strong>{" "}
                {t("sections.rights.items.objection.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.portability.title")}
                </strong>{" "}
                {t("sections.rights.items.portability.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.withdraw.title")}
                </strong>{" "}
                {t("sections.rights.items.withdraw.description")}
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  {t("sections.rights.items.complaint.title")}
                </strong>{" "}
                {t("sections.rights.items.complaint.description")}
              </li>
            </ul>
            <p className="text-foreground/80 leading-relaxed">{t("sections.rights.footer")}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  return <LegalLayout title={t("title")} description={t("subtitle")} sections={sections} />;
}
