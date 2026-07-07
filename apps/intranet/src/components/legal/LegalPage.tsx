"use client";

import { useEffect, useMemo, useState } from "react";

import { ArrowLeft, ArrowRight, Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { WordmarkLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

// These two section ids get the advantis GmbH contact block appended —
// keeps the address/email in one place (env vars) instead of duplicated
// across the DE/EN translation JSON.
const CONTACT_SECTION_IDS = new Set(["controller", "contact"]);

function ContactBox() {
  return (
    <div className="space-y-1 rounded-lg bg-muted/30 p-4 text-sm">
      <p className="font-semibold text-foreground">advantis GmbH</p>
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
  crossPage,
}: {
  title: string;
  subtitle: string;
  updated?: string;
  tocLabel: string;
  sections: LegalSection[];
  crossPage?: { label: string; href: string };
}) {
  const isMobile = useIsMobile();
  const tCommon = useTranslations("Common");
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
      <header className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <WordmarkLogo className="text-base" />
        </Link>
        <div className="flex items-center gap-4">
          {crossPage && (
            <Link
              href={crossPage.href}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {crossPage.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {tCommon("back")}
          </Link>
        </div>
      </header>

      {isMobile && (
        <Button
          onClick={() => setSidebarOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          aria-label={tocLabel}
        >
          <Menu className="h-6 w-6" />
        </Button>
      )}

      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[75vh] overflow-y-auto rounded-t-2xl"
          >
            <SheetTitle>{tocLabel}</SheetTitle>
            <div className="mt-4">{nav}</div>
          </SheetContent>
        </Sheet>
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
            <aside className="sticky top-8 max-h-[calc(100vh-4rem)] w-64 shrink-0 self-start overflow-y-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{tocLabel}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">{nav}</CardContent>
              </Card>
            </aside>
          )}

          <div className="min-w-0 flex-1 space-y-6">
            {sections.map(section => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 text-sm leading-relaxed text-foreground/80">
                    {section.paragraphs?.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
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
