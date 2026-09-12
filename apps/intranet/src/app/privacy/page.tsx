"use client";

import { useTranslations } from "next-intl";

import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export default function PrivacyPage() {
  const t = useTranslations("privacy");
  const tc = useTranslations("Common");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <LegalPage
      title={t("title")}
      subtitle={t("subtitle")}
      updated={t("updated")}
      tocLabel={t("tableOfContents")}
      summaryLabel={tc("inShort")}
      sections={sections}
      docs={[
        { label: tc("docTerms"), href: "/terms" },
        { label: tc("docPrivacy"), href: "/privacy" },
        { label: tc("docImprint"), href: "/imprint" },
      ]}
    />
  );
}
