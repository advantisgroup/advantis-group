"use client";

import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { COMPANY_ADDRESS } from "@/lib/company";

export default function Impressum() {
  const t = useTranslations("imprint");

  const sections = [
    {
      id: "company",
      title: t("sections.company.title"),
      content: (
        <div className="space-y-2">
          <p className="font-semibold text-foreground">
            <BrandText brand="advantis">advantis GmbH</BrandText>
          </p>
          <p>{COMPANY_ADDRESS}</p>
          <p>{t("sections.company.country")}</p>
        </div>
      ),
    },
    {
      id: "contact",
      title: t("sections.contact.title"),
      content: (
        <div className="space-y-2">
          <p>
            <span className="font-semibold text-foreground">{t("sections.contact.email")}</span>{" "}
            {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
          </p>
          <p>
            <span className="font-semibold text-foreground">{t("sections.contact.phone")}</span>{" "}
            {process.env.NEXT_PUBLIC_PHONE_NUMBER}
          </p>
        </div>
      ),
    },
    {
      id: "tax-id",
      title: t("sections.taxId.title"),
      content: <p>{t("sections.taxId.content")}</p>,
    },
    {
      id: "register",
      title: t("sections.register.title"),
      content: (
        <div className="space-y-2">
          <p>{t("sections.register.intro")}</p>
          <p>{t("sections.register.court")} Amtsgericht Nürnberg</p>
          <p>{t("sections.register.number")} HRB 46148</p>
        </div>
      ),
    },
    {
      id: "responsible",
      title: t("sections.responsible.title"),
      content: (
        <div className="space-y-2">
          <p>Andrea Reichl</p>
          <p>
            <BrandText brand="advantis">advantis GmbH</BrandText>
          </p>
          <p>{COMPANY_ADDRESS}</p>
        </div>
      ),
    },
  ];

  return <LegalLayout title={t("title")} sections={sections} />;
}
