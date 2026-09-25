"use client";

import { useEffect, useState } from "react";

import { List } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

function SectionNav({
  sections,
  activeSection,
  onSelect,
}: {
  sections: LegalSection[];
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="border-l border-rule">
      {sections.map((section, i) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          aria-current={activeSection === section.id ? "true" : undefined}
          className={cn(
            "-ml-px flex w-full items-baseline gap-2.5 border-l py-1.5 pl-4 pr-2 text-left text-[13px] transition-colors",
            activeSection === section.id
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          <span aria-hidden className="shrink-0 tabular-nums text-muted-foreground/60">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0">{section.title}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * The shell shared by the imprint, privacy, licences and cookie pages: a
 * title, then either a long document with a numbered rail down the side, or
 * plain children when the page has nothing to navigate (licences, cookies).
 * The switcher between the four pages lives in the header.
 */
export function LegalLayout({
  title,
  description,
  sections,
  children,
}: {
  title: string;
  description?: string;
  sections?: LegalSection[];
  children?: React.ReactNode;
}) {
  const t = useTranslations("privacy");
  const [activeSection, setActiveSection] = useState(sections?.[0]?.id ?? "");

  useEffect(() => {
    if (!sections) return;

    const onScroll = () => {
      const position = window.scrollY + 160;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        if (position >= element.offsetTop && position < element.offsetTop + element.offsetHeight) {
          setActiveSection(section.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY - 128,
      behavior: "smooth",
    });
    setActiveSection(id);
  };

  return (
    <div className="relative min-h-screen bg-background">
      <main className="relative mx-auto w-full max-w-[1200px] px-5 pb-24 pt-36 md:px-10 md:pt-48">
        <header className="max-w-3xl">
          <Display as="h1" size="lg">
            {title}
          </Display>
          {description ? (
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </header>

        {sections ? (
          <div className="mt-14 flex gap-12">
            <div className="min-w-0 flex-1">
              <details className="mb-10 border-y border-rule py-3 lg:hidden">
                <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <List className="size-4" aria-hidden />
                  {t("tableOfContents")}
                </summary>
                <div className="mt-3">
                  <SectionNav
                    sections={sections}
                    activeSection={activeSection}
                    onSelect={scrollTo}
                  />
                </div>
              </details>

              {sections.map((section, i) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-32 border-t border-rule py-9 first:border-t-0 first:pt-0"
                >
                  <h2 className="flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.015em]">
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground/70">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </h2>
                  <div className="mt-5 max-w-[46rem] leading-relaxed text-muted-foreground">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            <aside className="sticky top-32 hidden max-h-[calc(100vh-9rem)] w-60 shrink-0 self-start overflow-y-auto transition-[top] duration-300 [[data-header-hidden]_&]:top-6 lg:block">
              <p className="mb-2 pl-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("tableOfContents")}
              </p>
              <SectionNav sections={sections} activeSection={activeSection} onSelect={scrollTo} />
            </aside>
          </div>
        ) : (
          <div className="mt-14">{children}</div>
        )}
      </main>
    </div>
  );
}
