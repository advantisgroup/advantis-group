"use client";

import { useEffect, useMemo, useState } from "react";

import { ArrowLeft, ArrowUp, Check, Copy, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { WordmarkLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

export interface LegalCrossLink {
  label: string;
  href: string;
}

// These section ids get the advantis GmbH contact block appended — keeps
// the address/email/phone in one place (env vars) instead of duplicated
// across the DE/EN translation JSON. "provider" additionally gets the
// Umsatzsteuer-ID and Handelsregister entry, for the Impressum page.
const CONTACT_SECTION_IDS = new Set(["controller", "contact", "provider"]);
const FULL_LEGAL_SECTION_IDS = new Set(["provider"]);

/**
 * A legal value someone is likely to need elsewhere — pasted into an email,
 * a form, an accountant's system. Retyping a VAT number by hand off a web
 * page is exactly where transcription errors come from.
 */
function CopyableValue({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const tCommon = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="group flex items-start justify-between gap-2">
      <span className={cn("min-w-0 break-words", className)}>{children ?? value}</span>
      <button
        type="button"
        aria-label={`${tCommon("copy")}: ${label}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true);
              toast.success(tCommon("copied"));
            })
            .catch(() => toast.error(tCommon("copyFailed")));
        }}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function ContactBox({ full = false }: { full?: boolean }) {
  const address = process.env.NEXT_PUBLIC_ADRESS;
  const email = process.env.NEXT_PUBLIC_EMAIL_ADRESS;
  const phone = process.env.NEXT_PUBLIC_PHONE_NUMBER;

  return (
    <div className="space-y-1 rounded-lg bg-muted/30 p-4 text-sm">
      <p className="font-semibold text-foreground">advantis GmbH</p>
      <p className="text-foreground/80">Andrea Reichl</p>
      {address && (
        <CopyableValue value={address} label="advantis GmbH" className="text-muted-foreground">
          <address className="not-italic">{address}</address>
        </CopyableValue>
      )}
      {email && (
        <CopyableValue value={email} label={email} className="text-muted-foreground">
          <a href={`mailto:${email}`} className="hover:text-foreground hover:underline">
            {email}
          </a>
        </CopyableValue>
      )}
      {phone && (
        <CopyableValue value={phone} label={phone} className="text-muted-foreground">
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            className="hover:text-foreground hover:underline"
          >
            {phone}
          </a>
        </CopyableValue>
      )}
      {full && (
        <div className="space-y-1 pt-1">
          <CopyableValue value="DE463759734" label="USt-IdNr." className="text-muted-foreground">
            <>
              USt-IdNr.: <span className="tabular-nums">DE463759734</span>
            </>
          </CopyableValue>
          <CopyableValue
            value="HRB 46148"
            label="Handelsregister"
            className="text-muted-foreground"
          >
            <>Amtsgericht Nürnberg, HRB 46148</>
          </CopyableValue>
        </div>
      )}
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
  crossPage?: LegalCrossLink[];
}) {
  const isMobile = useIsMobile();
  const tCommon = useTranslations("Common");
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  function scrollToSection(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    const offset = 100;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveSection(id);
    setSidebarOpen(false);
    // Move focus to the section for keyboard/screen-reader users so the
    // scroll target is also where "next Tab" and announcements land.
    // `preventScroll` avoids fighting the smooth scroll above.
    element.focus({ preventScroll: true });
  }

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0);
      setShowBackToTop(window.scrollY > 600);

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        const { offsetTop, offsetHeight } = element;
        if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
          setActiveSection(section.id);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const nav = useMemo(
    () => (
      <nav aria-labelledby="legal-toc-heading" className="space-y-1">
        {sections.map((section, i) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            aria-current={activeSection === section.id ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeSection === section.id
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                activeSection === section.id
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="truncate">{section.title}</span>
          </button>
        ))}
      </nav>
    ),
    [sections, activeSection],
  );

  return (
    <div className="min-h-screen">
      <a
        href="#legal-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tCommon("skipToContent")}
      </a>

      <div
        role="progressbar"
        aria-label={tCommon("readingProgress")}
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <header className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <WordmarkLogo className="text-base" />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          {crossPage?.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
          <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl">
            <SheetTitle>{tocLabel}</SheetTitle>
            <div className="mt-4">{nav}</div>
          </SheetContent>
        </Sheet>
      )}

      <main id="legal-content" className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:pt-20">
        <div className="space-y-3 pb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          {updated && (
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70">{updated}</p>
          )}
        </div>

        <div className="relative flex gap-8">
          {!isMobile && (
            <aside className="sticky top-8 max-h-[calc(100vh-4rem)] w-64 shrink-0 self-start overflow-y-auto">
              <Card>
                <CardHeader>
                  <h2
                    id="legal-toc-heading"
                    className="text-base font-semibold leading-none tracking-tight"
                  >
                    {tocLabel}
                  </h2>
                </CardHeader>
                <CardContent className="pt-0">{nav}</CardContent>
              </Card>
            </aside>
          )}

          <div className="min-w-0 flex-1 space-y-6">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                tabIndex={-1}
                className="scroll-mt-24 focus:outline-none"
              >
                <Card>
                  <CardHeader>
                    {/* Same number the table of contents shows, so "see 04"
                        points at something the reader can actually find. */}
                    <h2 className="flex items-baseline gap-3 text-xl font-semibold leading-none tracking-tight">
                      <span className="shrink-0 text-base font-semibold tabular-nums text-primary">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">{section.title}</span>
                    </h2>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 text-sm leading-relaxed text-foreground/80">
                    {section.paragraphs?.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {CONTACT_SECTION_IDS.has(section.id) && (
                      <ContactBox full={FULL_LEGAL_SECTION_IDS.has(section.id)} />
                    )}
                    {section.list && (
                      <ul className="list-disc space-y-2 pl-5">
                        {section.list.map((item, i) => (
                          <li key={i}>
                            {item.title && (
                              <strong className="text-foreground">{item.title}: </strong>
                            )}
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    {section.note && (
                      <p className="text-xs text-muted-foreground">{section.note}</p>
                    )}
                  </CardContent>
                </Card>
              </section>
            ))}

            <div className="pt-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className={cn(
                  "transition-opacity",
                  showBackToTop ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                {tCommon("backToTop")}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
