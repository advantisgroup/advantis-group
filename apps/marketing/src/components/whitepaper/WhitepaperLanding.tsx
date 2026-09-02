"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { WhitepaperCover } from "@/components/whitepaper/WhitepaperCover";
import { WhitepaperForm, WhitepaperUnavailable } from "@/components/whitepaper/WhitepaperForm";
import { COMPANY_ADDRESS } from "@/lib/company";

const ITEMS = ["item1", "item2", "item3"] as const;
const STEPS = ["step1", "step2", "step3"] as const;

export function WhitepaperLanding({ available }: { available: boolean }) {
  const t = useTranslations("whitepaper");
  const tContact = useTranslations("whitepaper.contact");
  const tForm = useTranslations("whitepaper.form");

  const contactItems = [
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
      href: null,
    },
  ];

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,oklch(0.64_0.2_14_/_0.18),transparent_45%),radial-gradient(circle_at_90%_5%,oklch(0.76_0.16_68_/_0.1),transparent_45%)]" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/80 to-background" />

        <div className="container relative z-10 mx-auto px-4">
          {/*
            DOM order is headline → form → detail so the form is the first thing
            under the fold on a phone. On lg the form moves into its own column
            and the detail rises next to it.
          */}
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.8fr)] lg:gap-x-20 lg:gap-y-14">
            <div className="space-y-6 lg:col-start-1 lg:row-start-1">
              <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-advantis">
                {t("hero.badge")}
              </p>
              <h1 className="font-[family-name:var(--font-outfit)] text-4xl leading-[1.05] md:text-6xl lg:text-7xl">
                {t("hero.title")}
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                {t("hero.subtitle")}
              </p>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground/80">
                {t("hero.intro")}
              </p>
            </div>

            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 shadow-2xl shadow-black/5 backdrop-blur-sm lg:sticky lg:top-24">
                <div className="flex flex-col items-start gap-4 border-b border-border/60 bg-linear-to-br from-advantis/8 to-transparent p-6 sm:flex-row sm:items-center sm:gap-6 md:p-8">
                  <WhitepaperCover
                    title={t("hero.title")}
                    className="h-24 w-[72px] md:h-32 md:w-24"
                  />
                  <div className="space-y-1.5">
                    <h2 className="font-[family-name:var(--font-outfit)] text-xl md:text-2xl">
                      {tForm("title")}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {tForm("description")}
                    </p>
                  </div>
                </div>

                <div className="p-6 md:p-8">
                  {available ? <WhitepaperForm /> : <WhitepaperUnavailable />}
                </div>
              </div>
            </div>

            <ScrollReveal className="space-y-12 lg:col-start-1 lg:row-start-2">
              <div className="space-y-5">
                <h2 className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {t("highlights.title")}
                </h2>
                <ul className="divide-y divide-border/60 border-y border-border/60">
                  {ITEMS.map((item, index) => (
                    <li key={item} className="group flex gap-6 py-5">
                      <span className="font-[family-name:var(--font-outfit)] pt-1 text-sm tabular-nums tracking-[0.2em] text-advantis/60 transition-colors group-hover:text-advantis">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="space-y-1">
                        <h3 className="font-[family-name:var(--font-outfit)] text-lg md:text-xl">
                          {t(`highlights.${item}.title`)}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                          {t(`highlights.${item}.description`)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-5">
                <h2 className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {t("steps.title")}
                </h2>
                <ol className="grid gap-6 sm:grid-cols-3">
                  {STEPS.map((step, index) => (
                    <li key={step} className="space-y-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-advantis/30 bg-advantis/8 text-xs font-semibold text-advantis">
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-foreground">
                        {t(`steps.${step}.title`)}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t(`steps.${step}.description`)}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-7xl py-12 md:py-16">
            <div className="space-y-2">
              <h2 className="font-[family-name:var(--font-outfit)] text-2xl md:text-3xl">
                {tContact("title")}
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground">{tContact("description")}</p>
            </div>

            <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-3">
              {contactItems.map((item) => {
                const Icon = item.icon;
                const body = (
                  <>
                    <dt className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 text-advantis" />
                      {item.label}
                    </dt>
                    <dd className="wrap-break-word text-base text-foreground">{item.value}</dd>
                  </>
                );

                return item.href ? (
                  <a
                    key={item.label}
                    href={item.href}
                    className="space-y-2 bg-card p-6 transition-colors hover:bg-muted/50"
                  >
                    {body}
                  </a>
                ) : (
                  <div key={item.label} className="space-y-2 bg-card p-6">
                    {body}
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
