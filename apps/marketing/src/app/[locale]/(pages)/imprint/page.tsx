"use client";

import { Building2, Mail, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Impressum() {
  const t = useTranslations("imprint");

  const sections = [
    {
      icon: Building2,
      title: t("sections.company.title"),
      content: (
        <div className="space-y-2">
          <p className="font-semibold">
            <BrandText brand="advantis">Advantis GmbH</BrandText>
          </p>
          <p>{process.env.NEXT_PUBLIC_ADRESS}</p>
          <p className="text-muted-foreground">
            {t("sections.company.country")}
          </p>
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
    <div className="min-h-screen">
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">{t("title")}</h1>
        </section>

        <section className="max-w-6xl mx-auto space-y-12">
          {/* Top Info Grid */}
          <div className="border border-border">
            <div className="grid md:grid-cols-3 divide-x divide-border">
              {sections.map(section => {
                const Icon = section.icon;
                return (
                  <Card key={section.title} className="border-0 rounded-none">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>{section.content}</CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Register Section */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                {t("sections.register.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground">
              <p>{t("sections.register.intro")}</p>
              <p>{t("sections.register.court")} Amtsgericht Nürnberg</p>
              <p>{t("sections.register.number")} HRB 46148</p>
            </CardContent>
          </Card>

          {/* Responsible Section */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                {t("sections.responsible.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground">
              <p>Andrea Reichl</p>
              <p>
                <BrandText brand="advantis">Advantis GmbH</BrandText>
              </p>
              <p>{process.env.NEXT_PUBLIC_ADRESS}</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
