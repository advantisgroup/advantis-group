"use client";

import Image from "next/image";

import { ArrowRight, Heart, Target, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { CountUp } from "@/components/effects/CountUp";
import { Display, PageField, Section } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { useSingleLetterLogo } from "@/hooks/use-logo";
import { Link } from "@/i18n/navigation";

export default function UberUns() {
  const t = useTranslations("about");
  const logo = useSingleLetterLogo();

  const values = [
    { icon: Target, title: t("values.experienceTitle"), description: t("values.experienceDesc") },
    { icon: Zap, title: t("values.innovationTitle"), description: t("values.innovationDesc") },
    { icon: Heart, title: t("values.passionTitle"), description: t("values.passionDesc") },
  ];

  const stats = [
    { value: 15, suffix: "+", label: t("stats.experience") },
    { value: 150, suffix: "+", label: t("stats.projects") },
    { value: 4, suffix: "", label: t("stats.brands") },
  ];

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <div className="relative">
        <section className="relative pt-32 pb-20 md:pt-44 md:pb-28">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <Display as="h1" size="xl" className="max-w-[14ch]">
              {t("hero.titlePart1")} <span className="text-primary">{t("hero.titlePart2")}</span>
            </Display>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t.rich("hero.subtitle", {
                brand: (chunks) => <span className="text-foreground">{chunks}</span>,
              })}
            </p>
          </div>
        </section>

        {/* Mission and vision, as two cells of one grid rather than two floating cards. */}
        <Section>
          <div className="grid gap-px bg-rule md:grid-cols-2">
            {[
              {
                badge: t("mission.badge"),
                title: t("mission.title"),
                text: t("mission.description"),
                Icon: Target,
              },
              {
                badge: t("vision.badge"),
                title: t("vision.title"),
                text: t("vision.description"),
                Icon: Zap,
              },
            ].map((panel) => (
              <div
                key={panel.badge}
                className="group relative overflow-hidden bg-background p-8 md:p-12"
              >
                <panel.Icon
                  aria-hidden
                  className="pointer-events-none absolute -bottom-12 -right-10 size-56 rotate-12 text-primary/[0.04] transition-colors duration-500 group-hover:text-primary/[0.08]"
                  strokeWidth={1}
                />
                <div className="relative">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
                    {panel.badge}
                  </span>
                  <Display size="sm" className="mt-6">
                    {panel.title}
                  </Display>
                  <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
                    {panel.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {t("story.badge")}
              </span>
              <span aria-hidden className="mt-4 block h-px w-16 bg-primary" />
            </div>

            <div className="max-w-3xl">
              <p className="text-xl leading-[1.6] text-foreground md:text-2xl">
                {t.rich("story.text1", {
                  brand: (chunks) => <>{chunks}</>,
                  founder: (chunks) => <span className="text-primary">{chunks}</span>,
                })}
              </p>
              <p className="mt-6 text-base leading-[1.75] text-muted-foreground md:text-lg">
                {t.rich("story.text2", { brand: (chunks) => <>{chunks}</> })}
              </p>
              <p className="mt-6 text-base leading-[1.75] text-muted-foreground md:text-lg">
                {t("story.text3")}
              </p>

              <div className="mt-12 border-t border-rule pt-10">
                <div className="relative h-14 w-40 opacity-60 grayscale transition-all duration-500 hover:opacity-100 hover:grayscale-0">
                  <Image
                    src={logo}
                    alt="ADVANTIS GROUP"
                    fill
                    className="object-contain object-left"
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section size="tight">
          <dl className="grid gap-px bg-rule md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-background p-8 md:p-10">
                <dd className="font-[family-name:var(--font-outfit)] text-5xl font-bold tabular-nums tracking-[-0.03em] text-primary md:text-6xl">
                  <CountUp value={stat.value} />
                  {stat.suffix}
                </dd>
                <dt className="mt-4 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Section>

        {/* Centred here, against the left-set sections above and below. */}
        <Section>
          <Display size="md" className="mx-auto max-w-[18ch] text-center">
            {t("values.badge")}
          </Display>

          <div className="mt-14 grid gap-px bg-rule md:grid-cols-3">
            {values.map((value, index) => (
              <div key={value.title} className="bg-background p-8">
                <div className="flex items-center justify-between">
                  <value.icon className="size-7 text-primary" strokeWidth={1.5} />
                  <span className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground/50">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-8 font-[family-name:var(--font-outfit)] text-xl font-bold tracking-[-0.02em]">
                  {value.title}
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </Section>

        {/*
         * The one inverted block on the site — a solid primary field. It is the
         * page's full stop, and being the only one of its kind is the point.
         */}
        <section className="grain relative overflow-hidden border-t border-rule bg-primary py-24 text-primary-foreground md:py-32">
          <div aria-hidden className="hatch-strong absolute inset-0 opacity-30" />
          <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <div className="mx-auto max-w-3xl text-center">
              <Display as="h2" size="lg">
                {t("cta.title")}
              </Display>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-primary-foreground/80 md:text-xl">
                {t("cta.description")}
              </p>
              <Button asChild size="lg" variant="secondary" className="mt-10 rounded-none">
                <Link href="/contact">
                  {t("cta.button")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
