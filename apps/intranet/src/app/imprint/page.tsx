"use client";

import { useTranslations } from "next-intl";

import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export default function ImprintPage() {
  const t = useTranslations("imprint");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <LegalPage
      title={t("title")}
      subtitle={t("subtitle")}
      updated={t("updated")}
      tocLabel={t("tableOfContents")}
      sections={sections}
      crossPage={[
        { label: t("viewTerms"), href: "/terms" },
        { label: t("viewPrivacy"), href: "/privacy" },
      ]}
    />
  );
}
