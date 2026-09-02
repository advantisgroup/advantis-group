"use client";

import { FileText, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { ContactInfoDesktop, ContactInfoMobile } from "@/components/contact/ContactInfo";
import { WhitepaperForm, WhitepaperUnavailable } from "@/components/whitepaper/WhitepaperForm";
import { COMPANY_ADDRESS } from "@/lib/company";
import { type ContactInfoItem } from "@/types/contact";

const HIGHLIGHTS = ["item1", "item2", "item3"] as const;

export function WhitepaperLanding({ available }: { available: boolean }) {
  const t = useTranslations("whitepaper");
  const tContact = useTranslations("whitepaper.contact");
  const tForm = useTranslations("whitepaper.form");

  const contactInfoData: ContactInfoItem[] = [
    {
      icon: Mail,
      label: tContact("email"),
      value: `${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
      href: `mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
    },
    {
      icon: Phone,
      label: tContact("phone"),
      value: `${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
      href: `tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
    },
    {
      icon: MapPin,
      label: tContact("address"),
      value: COMPANY_ADDRESS,
      href: "#",
    },
  ];

  return (
    <div className="min-h-screen">
      <main className="container mx-auto space-y-16 px-4 pb-24 pt-24 md:space-y-24">
        <section className="mx-auto max-w-4xl space-y-6 text-center md:space-y-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-advantis/25 bg-advantis/8 px-4 py-1.5 text-xs font-medium text-advantis">
            <Sparkles className="h-3 w-3" />
            {t("hero.badge")}
          </span>
          <h1 className="text-4xl font-bold md:text-5xl lg:text-7xl">{t("hero.title")}</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t("hero.subtitle")}
          </p>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">{t("hero.intro")}</p>
        </section>

        <section className="mx-auto max-w-6xl space-y-8 md:space-y-12">
          <div className="md:hidden">
            <ContactInfoMobile items={contactInfoData} />
          </div>
          <div className="hidden md:block">
            <ContactInfoDesktop items={contactInfoData} />
          </div>

          <section className="overflow-hidden rounded-4xl border border-border/70 bg-background/70 shadow-xl shadow-black/5">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="space-y-6 p-6 md:p-8">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
                    {tForm("title")}
                  </h2>
                  <p className="text-base text-muted-foreground">{tForm("description")}</p>
                </div>

                {available ? <WhitepaperForm /> : <WhitepaperUnavailable />}
              </div>

              <aside className="space-y-6 border-t border-border/70 bg-muted/20 p-6 md:border-l md:border-t-0 md:p-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">{t("highlights.title")}</h3>
                  <ul className="space-y-4">
                    {HIGHLIGHTS.map((item) => (
                      <li key={item} className="flex gap-3">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-advantis" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {t(`highlights.${item}.title`)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t(`highlights.${item}.description`)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 border-t border-border/70 pt-6">
                  <h3 className="text-lg font-semibold text-foreground">{tContact("title")}</h3>
                  <p className="text-sm text-muted-foreground">{tContact("description")}</p>
                  <p className="text-sm">
                    <a
                      href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}
                      className="text-advantis hover:underline"
                    >
                      {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
                    </a>
                  </p>
                  <p className="text-sm">
                    <a
                      href={`tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}
                      className="text-advantis hover:underline"
                    >
                      {process.env.NEXT_PUBLIC_PHONE_NUMBER}
                    </a>
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
