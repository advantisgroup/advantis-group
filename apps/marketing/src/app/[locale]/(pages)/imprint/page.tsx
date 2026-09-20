"use client";

import { Building2, Mail, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Display } from "@/components/frame";
import { COMPANY_ADDRESS } from "@/lib/company";

export default function Impressum() {
  const t = useTranslations("imprint");

  const sections = [
    {
      icon: Building2,
      title: t("sections.company.title"),
      content: (
        <div className="space-y-2">
          <p className="font-semibold">
            <BrandText brand="advantis">advantis GmbH</BrandText>
          </p>
          <p>{COMPANY_ADDRESS}</p>
          <p className="text-muted-foreground">{t("sections.company.country")}</p>
        </div>
      ),
    },
    {
      icon: Mail,
      title: t("sections.contact.title"),
      content: (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold">{t("sections.contact.email")}</span>{" "}
            {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold">{t("sections.contact.phone")}</span>{" "}
            {process.env.NEXT_PUBLIC_PHONE_NUMBER}
          </p>
        </div>
      ),
    },
    {
      icon: FileText,
      title: t("sections.taxId.title"),
      content: (
        <div className="space-y-2">
          <p className="text-muted-foreground">{t("sections.taxId.content")}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="relative min-h-screen bg-background">
      <main className="relative mx-auto w-full max-w-[1200px] px-5 pt-32 pb-24 md:px-10 md:pt-44">
        <Display as="h1" size="lg">
          {t("title")}
        </Display>

        <div className="mt-16 grid gap-px overflow-hidden rounded-t-xl bg-rule md:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="bg-background p-6 md:p-8">
                <Icon className="size-6 text-primary" strokeWidth={1.5} />
                <h2 className="mt-6 text-xl font-semibold tracking-[-0.015em]">{section.title}</h2>
                <div className="mt-4 text-sm leading-relaxed md:text-base">{section.content}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-px grid gap-px overflow-hidden rounded-b-xl bg-rule md:grid-cols-2">
          <div className="bg-background p-6 md:p-8">
            <h2 className="text-xl font-semibold tracking-[-0.015em]">
              {t("sections.register.title")}
            </h2>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground md:text-base">
              <p>{t("sections.register.intro")}</p>
              <p>{t("sections.register.court")} Amtsgericht Nürnberg</p>
              <p>{t("sections.register.number")} HRB 46148</p>
            </div>
          </div>

          <div className="bg-background p-6 md:p-8">
            <h2 className="text-xl font-semibold tracking-[-0.015em]">
              {t("sections.responsible.title")}
            </h2>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground md:text-base">
              <p>Andrea Reichl</p>
              <p>
                <BrandText brand="advantis">advantis GmbH</BrandText>
              </p>
              <p>{COMPANY_ADDRESS}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
