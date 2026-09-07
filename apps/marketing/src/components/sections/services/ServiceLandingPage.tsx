"use client";

import { useEffect, useState } from "react";

import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display, PageField } from "@/components/frame";
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
    const candidate = SERVICE_SLUGS[(startIndex + offset) % SERVICE_SLUGS.length];
    if (candidate !== slug) related.push(candidate);
  }
  return related;
}

/**
 * Highlights whichever section heading is currently at the top of the
 * viewport, so the contents rail tracks the reader's position.
 *
 * Takes the ids pre-joined rather than as an array: a fresh array on every
 * render would tear down and rebuild the observer on every render.
 */
function useActiveSection(idsKey: string) {
  const [activeId, setActiveId] = useState(() => idsKey.split("|")[0] ?? "");

  useEffect(() => {
    const elements = idsKey
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // A band near the top of the viewport: a heading is "current" once it
      // reaches the header and until the next one gets there.
      { rootMargin: "-20% 0px -70% 0px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [idsKey]);

  return activeId;
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

  /*
   * The page was a single centred column of stacked prose with no way to see
   * its shape. Building the section list up front lets the body run as a
   * two-column layout with a contents rail, which is both easier to skim and
   * honest about how long the page is.
   */
  const sections = [
    ...(whatTitle && whatText ? [{ id: "was", title: whatTitle, text: whatText }] : []),
    { id: "leistungen", title: common("offeringsTitle"), text: t("offeringsText") },
    ...extraSections.map((section, index) => ({
      id: `thema-${index + 1}`,
      title: section.title,
      text: section.text,
    })),
    { id: "warum", title: common("whyTitle"), text: t("whyText") },
  ];

  // Where the AI block sits in the running order: after the intro sections.
  const aiPosition = whatTitle && whatText ? 2 : 1;

  const railEntries = [
    ...sections.slice(0, aiPosition),
    { id: "ki", title: t("aiTitle"), text: "" },
    ...sections.slice(aiPosition),
  ];

  const activeId = useActiveSection(railEntries.map((entry) => entry.id).join("|"));

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <div className="relative">
        <section className="relative pt-24 pb-10 md:pt-40 md:pb-24">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <Link
              href="/#leistungen"
              className="-my-2 inline-flex min-h-11 items-center gap-2 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {common("backLabel")}
            </Link>

            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
              <div>
                <Icon className="size-10 text-primary" strokeWidth={1.25} />
                <Display as="h1" size="lg" className="mt-8 max-w-[18ch]">
                  {t("title")}
                </Display>
              </div>

              <p className="text-base leading-relaxed text-muted-foreground md:text-lg lg:pb-2">
                {t("heroSubtitle")}
              </p>
            </div>
          </div>
        </section>

        <div className="border-t border-rule">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <div className="grid gap-10 py-12 md:py-24 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-20">
              <nav aria-label={common("seoLabel")} className="lg:sticky lg:top-28 lg:self-start">
                <ol className="border-t border-rule">
                  {railEntries.map((entry, index) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className={`flex gap-3 border-b border-rule py-3 text-sm transition-colors ${
                          activeId === entry.id
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] tracking-[0.2em] ${
                            activeId === entry.id ? "text-primary" : "text-muted-foreground/50"
                          }`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="max-w-3xl">
                {sections.slice(0, aiPosition).map((section) => (
                  <Prose
                    key={section.id}
                    id={section.id}
                    title={section.title}
                    text={section.text}
                  />
                ))}

                <section
                  id="ki"
                  className="mt-12 scroll-mt-28 border-t border-rule pt-10 first:mt-0 first:border-t-0 first:pt-0"
                >
                  <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-[-0.025em] md:text-3xl">
                    {t("aiTitle")}
                  </h2>
                  <ul className="mt-6 grid gap-px overflow-hidden rounded-xl bg-rule sm:grid-cols-2">
                    {aiItems.map((item, index) => (
                      <li
                        key={item}
                        // An odd item count would otherwise leave the trailing
                        // grid cell empty, showing through as a grey block.
                        className={`flex gap-3 bg-background p-4 ${
                          aiItems.length % 2 === 1 && index === aiItems.length - 1
                            ? "sm:col-span-2"
                            : ""
                        }`}
                      >
                        <span className="font-mono text-[11px] tracking-[0.2em] text-primary/60">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm leading-relaxed md:text-base">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {sections.slice(aiPosition).map((section) => (
                  <Prose
                    key={section.id}
                    id={section.id}
                    title={section.title}
                    text={section.text}
                  />
                ))}

                <p className="mt-16 border-t border-rule pt-6 font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground/60">
                  <span className="uppercase tracking-[0.24em] text-muted-foreground">
                    {common("seoLabel")}
                  </span>
                  <br />
                  {t("seoKeywords")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <section className="grain relative overflow-hidden border-t border-rule py-16 md:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 70% at 50% 108%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)",
            }}
          />
          <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <div className="mx-auto max-w-3xl text-center">
              <Display as="h2" size="md">
                {common("ctaTitle")}
              </Display>
              <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {t("ctaText")}
              </p>
              <Button asChild size="lg" className="mt-9 rounded-lg">
                <Link href="/contact">
                  {common("ctaButton")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-rule py-12 md:py-20">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <h2 className="font-[family-name:var(--font-outfit)] text-xl font-bold tracking-[-0.02em] md:text-2xl">
              {common("relatedTitle")}
            </h2>

            <div className="mt-8 border-t border-rule">
              {relatedSlugs.map((relatedSlug, index) => (
                <RelatedServiceRow key={relatedSlug} slug={relatedSlug} index={index} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const Prose = ({ id, title, text }: { id: string; title: string; text: string }) => (
  <section
    id={id}
    className="scroll-mt-28 border-t border-rule pt-10 first:border-t-0 first:pt-0 [&:not(:first-child)]:mt-12"
  >
    <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-[-0.025em] md:text-3xl">
      {title}
    </h2>
    <p className="mt-5 text-base leading-[1.75] text-muted-foreground md:text-lg">{text}</p>
  </section>
);

const RelatedServiceRow = ({ slug, index }: { slug: ServiceSlug; index: number }) => {
  const t = useTranslations(`services.items.${slug}`);
  const Icon = SERVICE_ICONS[slug];

  return (
    <Link
      href={`/services/${slug}`}
      className="group grid gap-2 border-b border-rule py-5 transition-colors hover:bg-card/50 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-6 md:px-3"
    >
      <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground/50 transition-colors group-hover:text-primary">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="flex items-center gap-3">
        <Icon className="size-5 shrink-0 text-primary" strokeWidth={1.5} />
        <span className="font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-[-0.02em]">
          {t("tileTitle")}
        </span>
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">{t("tileDescription")}</span>
      <ArrowUpRight className="size-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
    </Link>
  );
};
