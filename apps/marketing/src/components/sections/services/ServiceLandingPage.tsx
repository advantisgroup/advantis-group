"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { SectionDivider } from "@/components/layout/SectionDivider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { SERVICE_ICONS, SERVICE_SLUGS, type ServiceSlug } from "@/lib/services";

interface ExtraSection {
  title: string;
  text: string;
}

function getRelatedSlugs(slug: ServiceSlug): ServiceSlug[] {
  const startIndex = SERVICE_SLUGS.indexOf(slug);
  const related: ServiceSlug[] = [];
  for (let offset = 1; related.length < 3; offset++) {
    const candidate =
      SERVICE_SLUGS[(startIndex + offset) % SERVICE_SLUGS.length];
    if (candidate !== slug) related.push(candidate);
  }
  return related;
}

export const ServiceLandingPage = ({ slug }: { slug: ServiceSlug }) => {
  const t = useTranslations(`services.items.${slug}`);
  const common = useTranslations("services.common");
  const Icon = SERVICE_ICONS[slug];

  const whatTitle = t("whatTitle");
  const whatText = t("whatText");
  const aiItems = t.raw("aiItems") as string[];
  const extraSections = t.raw("extraSections") as ExtraSection[];
  const relatedSlugs = getRelatedSlugs(slug);

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/50 py-24 md:py-32">
        <div className="absolute inset-0 bg-linear-to-b from-background via-primary/5 to-background" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-4xl space-y-8">
            <Link
              href="/#leistungen"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {common("backLabel")}
            </Link>

            <div className="flex items-center gap-4">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-7 w-7" strokeWidth={1.5} />
              </span>
              <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
                {t("tileTitle")}
              </p>
            </div>

            <h1 className="font-[family-name:var(--font-outfit)] text-4xl leading-[1.05] md:text-6xl">
              {t("title")}
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t("heroSubtitle")}
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-4xl space-y-24 px-4 py-20">
        {whatTitle && whatText ? (
          <ScrollReveal>
            <section className="space-y-4">
              <h2 className="text-2xl font-bold md:text-3xl">{whatTitle}</h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                {whatText}
              </p>
            </section>
          </ScrollReveal>
        ) : null}

        <ScrollReveal>
          <section className="space-y-4">
            <h2 className="text-2xl font-bold md:text-3xl">
              {common("offeringsTitle")}
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {t("offeringsText")}
            </p>
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section className="space-y-6">
            <h2 className="text-2xl font-bold md:text-3xl">{t("aiTitle")}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {aiItems.map(item => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4"
                >
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm leading-relaxed md:text-base">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </ScrollReveal>

        {extraSections.map(section => (
          <ScrollReveal key={section.title}>
            <section className="space-y-4">
              <h2 className="text-2xl font-bold md:text-3xl">
                {section.title}
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                {section.text}
              </p>
            </section>
          </ScrollReveal>
        ))}

        <ScrollReveal>
          <section className="space-y-4 rounded-3xl border border-border/60 bg-card/40 p-8 md:p-12">
            <h2 className="text-2xl font-bold md:text-3xl">
              {common("whyTitle")}
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {t("whyText")}
            </p>
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <p className="text-sm leading-relaxed text-muted-foreground/70">
            <span className="font-semibold text-muted-foreground">
              {common("seoLabel")}:
            </span>{" "}
            {t("seoKeywords")}
          </p>
        </ScrollReveal>
      </div>

      <SectionDivider variant="dots" opacity={0.3} />

      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-linear-to-b from-primary/8 via-background/95 to-background" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-3xl space-y-8 text-center">
            <h2 className="font-[family-name:var(--font-outfit)] text-3xl leading-tight md:text-5xl">
              {common("ctaTitle")}
            </h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("ctaText")}
            </p>
            <Button asChild size="lg" className="group px-8 py-7 text-lg">
              <Link href="/contact">
                {common("ctaButton")}
                <ArrowRight className="ml-3 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center font-[family-name:var(--font-outfit)] text-2xl md:text-3xl">
            {common("relatedTitle")}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {relatedSlugs.map(relatedSlug => (
              <RelatedServiceCard key={relatedSlug} slug={relatedSlug} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const RelatedServiceCard = ({ slug }: { slug: ServiceSlug }) => {
  const t = useTranslations(`services.items.${slug}`);
  const Icon = SERVICE_ICONS[slug];

  return (
    <Link
      href={`/services/${slug}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-6 transition-all duration-300 hover:border-primary/40 hover:bg-card/70"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h3 className="font-[family-name:var(--font-outfit)] text-lg">
        {t("tileTitle")}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("tileDescription")}
      </p>
      <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
};
