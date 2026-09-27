"use client";

import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/Logo";
import { BrandEmphasis } from "@/components/effects/BrandEmphasis";
import { Display, PageHeader, Section, SectionHead, StatRow } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function UberUns() {
  const t = useTranslations("about");

  const values = [
    { title: t("values.experienceTitle"), description: t("values.experienceDesc") },
    { title: t("values.innovationTitle"), description: t("values.innovationDesc") },
    { title: t("values.passionTitle"), description: t("values.passionDesc") },
  ];

  const stats = [
    { value: 15, suffix: "+", label: t("stats.experience") },
    { value: 150, suffix: "+", label: t("stats.projects") },
    { value: 4, label: t("stats.brands") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title={
          <>
            {t("hero.titlePart1")} <span className="text-primary">{t("hero.titlePart2")}</span>
          </>
        }
        lede={t.rich("hero.subtitle", {
          brand: (chunks) => <span className="text-foreground">{chunks}</span>,
        })}
      />

      {/* Mission and vision, side by side behind hairlines. The oversized
          watermark icons that used to sit in the corner of each are gone —
          a 224px icon at 4% opacity is a smudge, not a graphic. */}
      <Section>
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          {[
            {
              badge: t("mission.badge"),
              title: t("mission.title"),
              text: t("mission.description"),
            },
            { badge: t("vision.badge"), title: t("vision.title"), text: t("vision.description") },
          ].map((panel) => (
            <div key={panel.badge} className="border-t border-rule pt-6">
              <span className="text-[0.8125rem] font-medium text-muted-foreground">
                {panel.badge}
              </span>
              <Display size="md" className="mt-4">
                {panel.title}
              </Display>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                {panel.text}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* The story, set as an article: serif at reading size, one column. */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start lg:transition-[top] lg:duration-300 lg:[[data-header-hidden]_&]:top-6">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">
              {t("story.badge")}
            </span>
          </div>

          <div className="reading max-w-[65ch]">
            <p className="text-[1.375rem] leading-[1.5] text-foreground">
              {t.rich("story.text1", {
                brand: (chunks) => <>{chunks}</>,
                founder: (chunks) => <span className="text-primary">{chunks}</span>,
              })}
            </p>
            <p className="mt-6 text-muted-foreground">
              {t.rich("story.text2", { brand: (chunks) => <>{chunks}</> })}
            </p>
            <p className="mt-6 text-muted-foreground">{t("story.text3")}</p>

            <div className="mt-12 border-t border-rule pt-10">
              <Logo height={22} />
            </div>
          </div>
        </div>
      </Section>

      <Section size="tight">
        <StatRow items={stats} />
      </Section>

      <Section size="loose">
        <SectionHead title={<BrandEmphasis tint="end">{t("values.badge")}</BrandEmphasis>} />

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {values.map((value) => (
            <div key={value.title} className="border-t border-rule pt-6">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">{value.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/*
       * The page's full stop. It used to be a solid field of the Advantis red
       * with a diagonal hatch over it — a whole band spending the one colour
       * the site keeps for marking single things. Inverting the ground ends
       * the page just as firmly and costs no accent.
       */}
      <section className="border-t border-rule bg-ink text-on-ink">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20 text-center md:px-10 md:py-32">
          <Display as="h2" size="lg" className="mx-auto max-w-[20ch]">
            {t("cta.title")}
          </Display>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-on-ink/70 md:text-lg">
            {t("cta.description")}
          </p>
          <Button asChild size="lg" className="mt-9 bg-on-ink text-ink hover:bg-on-ink/90">
            <Link href="/contact">{t("cta.button")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
