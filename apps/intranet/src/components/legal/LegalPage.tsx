"use client";

import { useEffect, useMemo, useState } from "react";

import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface LegalListItem {
  title?: string;
  description: string;
}

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  list?: LegalListItem[];
  note?: string;
}

// These two section ids get the Advantis Group contact block appended —
// keeps the address/email in one place (env vars) instead of duplicated
// across the DE/EN translation JSON.
const CONTACT_SECTION_IDS = new Set(["controller", "contact"]);

function ContactBox() {
  return (
    <div className="space-y-1 rounded-lg bg-muted/30 p-4 text-sm">
      <p className="font-semibold text-foreground">Advantis Group GmbH</p>
      <p className="text-foreground/80">Andrea Reichl</p>
      <p className="text-muted-foreground">{process.env.NEXT_PUBLIC_ADRESS}</p>
      <p className="text-muted-foreground">
        {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
      </p>
    </div>
  );
}

export function LegalPage({
  title,
  subtitle,
  updated,
  tocLabel,
  sections,
}: {
  title: string;
  subtitle: string;
  updated?: string;
  tocLabel: string;
  sections: LegalSection[];
}) {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function scrollToSection(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    const offset = 100;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveSection(id);
    setSidebarOpen(false);
  }

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        const { offsetTop, offsetHeight } = element;
        if (
          scrollPosition >= offsetTop &&
          scrollPosition < offsetTop + offsetHeight
        ) {
          setActiveSection(section.id);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const nav = useMemo(
    () => (
      <nav className="space-y-1">
        {sections.map((section, i) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              activeSection === section.id
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                activeSection === section.id
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="truncate">{section.title}</span>
          </button>
        ))}
      </nav>
    ),
    [sections, activeSection]
  );

  return (
    <div className="min-h-screen">
      {isMobile && (
        <Button
          onClick={() => setSidebarOpen(v => !v)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          aria-label={tocLabel}
        >
          {sidebarOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </Button>
      )}

      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:pt-20">
        <div className="space-y-3 pb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            {subtitle}
          </p>
          {updated && (
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70">
              {updated}
            </p>
          )}
        </div>

        <div className="relative flex gap-8">
          {!isMobile && (
            <aside className="sticky top-8 w-64 shrink-0 self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{tocLabel}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">{nav}</CardContent>
              </Card>
            </aside>
          )}

          {isMobile && sidebarOpen && (
            <aside className="fixed right-0 top-0 z-50 h-full w-80 max-w-[85vw] overflow-y-auto border-l border-border bg-background p-4">
              <p className="mb-3 px-1 text-sm font-semibold">{tocLabel}</p>
              {nav}
            </aside>
          )}

          <div className="min-w-0 flex-1 space-y-6">
            {sections.map(section => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 text-sm leading-relaxed text-foreground/80">
                    {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
                    {CONTACT_SECTION_IDS.has(section.id) && <ContactBox />}
                    {section.list && (
                      <ul className="list-disc space-y-2 pl-5">
                        {section.list.map((item, i) => (
                          <li key={i}>
                            {item.title && (
                              <strong className="text-foreground">
                                {item.title}:{" "}
                              </strong>
                            )}
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    {section.note && (
                      <p className="text-xs text-muted-foreground">
                        {section.note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
