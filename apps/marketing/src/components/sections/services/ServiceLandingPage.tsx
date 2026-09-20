"use client";

import { useEffect, useState } from "react";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { SERVICE_SLUGS, type ServiceSlug } from "@/lib/services";
import { cn } from "@/lib/utils";

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

/**
 * A service page is a document, so it is set as one: a centred opening, a
 * contents rail, and a single column of serif body copy at reading size.
 *
 * The numbered mono rail, the numbered AI grid and the wash behind the
 * closing band are gone. Eleven of these pages exist and they are mostly
 * prose — the job is to make the prose readable, not to decorate it.
 */
export const ServiceLandingPage = ({ slug }: { slug: ServiceSlug }) => {
  const t = useTranslations(`services.items.${slug}`);
  const common = useTranslations("services.common");

  const whatTitle = t("whatTitle");
  const whatText = t("whatText");
  const aiItems = t.raw("aiItems") as string[];
  const extraSections = t.raw("extraSections") as ExtraSection[];
  const relatedSlugs = getRelatedSlugs(slug);

  const sections = [
    ...(whatTitle && whatText ? [{ id: "was", title: whatTitle, text: whatText }] : []),
    { id: "leistungen", title: common("offeringsTitle"), text: t("offeringsText") },
    ...extraSections.map((section, index) => ({
      id: `thema-${(index + 1).toString()}`,
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
    <div className="min-h-screen bg-background">
      <header className="pt-28 pb-14 md:pt-36 md:pb-20">
        <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
          <Link
            href="/#leistungen"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {common("backLabel")}
          </Link>

          <div className="mx-auto mt-10 max-w-3xl">
            <Display as="h1" size="lg" className="text-center">
              {t("title")}
            </Display>
            {/*
             * Heading centred, lede ragged-right. These subtitles run to a
             * full paragraph, and centred body copy that long gives the eye
             * no fixed edge to return to on each line.
             */}
            <p className="reading mx-auto mt-7 max-w-[60ch] text-muted-foreground">
              {t("heroSubtitle")}
            </p>
          </div>
        </div>
      </header>

      <div className="border-t border-rule">
        <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
          <div className="grid gap-12 py-14 md:py-24 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-20">
            <nav aria-label={common("seoLabel")} className="lg:sticky lg:top-28 lg:self-start">
              <ol>
                {railEntries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={cn(
                        "block border-l py-2 pl-4 text-sm transition-colors",
                        activeId === entry.id
                          ? "border-foreground text-foreground"
                          : "border-rule text-muted-foreground hover:border-rule-strong hover:text-foreground",
                      )}
                    >
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="max-w-[68ch]">
              {sections.slice(0, aiPosition).map((section) => (
                <Prose key={section.id} id={section.id} title={section.title} text={section.text} />
              ))}

              <section id="ki" className="mt-14 scroll-mt-28 border-t border-rule pt-12">
                <Display as="h2" size="md">
                  {t("aiTitle")}
                </Display>
                <ul className="mt-6">
                  {aiItems.map((item) => (
                    <li
                      key={item}
                      className="border-t border-rule py-3.5 text-base last:border-b md:text-[1.0625rem]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              {sections.slice(aiPosition).map((section) => (
                <Prose key={section.id} id={section.id} title={section.title} text={section.text} />
              ))}

              <p className="mt-16 border-t border-rule pt-6 text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{common("seoLabel")}</span>
                <br />
                {t("seoKeywords")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="border-t border-rule bg-foreground text-background">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20 text-center md:px-10 md:py-28">
          <Display as="h2" size="md" className="mx-auto max-w-[22ch]">
            {common("ctaTitle")}
          </Display>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-background/70 md:text-lg">
            {t("ctaText")}
          </p>
          <Button
            asChild
            size="lg"
            className="mt-9 bg-background text-foreground hover:bg-background/90"
          >
            <Link href="/contact">{common("ctaButton")}</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-rule py-14 md:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
          <h2 className="text-xl font-semibold tracking-[-0.015em]">{common("relatedTitle")}</h2>

          <ul className="mt-8 grid gap-x-10 md:grid-cols-3">
            {relatedSlugs.map((relatedSlug) => (
              <RelatedService key={relatedSlug} slug={relatedSlug} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};

const Prose = ({ id, title, text }: { id: string; title: string; text: string }) => (
  <section
    id={id}
    className="scroll-mt-28 border-t border-rule pt-12 first:border-t-0 first:pt-0 [&:not(:first-child)]:mt-14"
  >
    <Display as="h2" size="md">
      {title}
    </Display>
    <p className="reading mt-5 text-muted-foreground">{text}</p>
  </section>
);

const RelatedService = ({ slug }: { slug: ServiceSlug }) => {
  const t = useTranslations(`services.items.${slug}`);

  return (
    <li>
      <Link
        href={`/services/${slug}`}
        className="group flex h-full flex-col border-t border-rule py-6 transition-colors hover:border-rule-strong"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold tracking-[-0.01em]">{t("tileTitle")}</span>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("tileDescription")}
        </span>
      </Link>
    </li>
  );
};
