"use client";

import { useTranslations } from "next-intl";

import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export default function PrivacyPage() {
  const t = useTranslations("privacy");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <LegalPage
      title={t("title")}
      subtitle={t("subtitle")}
      updated={t("updated")}
      tocLabel={t("tableOfContents")}
      sections={sections}
    />
  );
}
