"use client";

import { useEffect, useMemo, useState } from "react";

import { usePathname } from "next/navigation";

import { ArrowLeft, ArrowUp, Check, Copy, Link2, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { WordmarkLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
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
  /** One plain-language line above the section. Not binding — the wording
   * below it is what counts — but it's what makes these pages skimmable. */
  summary?: string;
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
    <div className="my-5 space-y-1 rounded-xl border border-border/60 bg-muted/25 p-4 text-[14px]">
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

/** Deep link to one section — "see 04" only helps if you can hand someone
 * the address of 04. */
function AnchorLink({ id, label }: { id: string; label: string }) {
  const tCommon = useTranslations("Common");
  return (
    <button
      type="button"
      aria-label={`${tCommon("copy")}: ${label}`}
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        void navigator.clipboard
          .writeText(url)
          .then(() => toast.success(tCommon("copied")))
          .catch(() => toast.error(tCommon("copyFailed")));
      }}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover/heading:opacity-100 md:focus-visible:opacity-100"
    >
      <Link2 className="size-3.5" />
    </button>
  );
}

/**
 * The shared shell for Terms, Privacy and the Imprint: one long document with
 * a rail down the side telling you where you are. Deliberately typographic
 * rather than a stack of cards — legal text is read in sequence, and card
 * chrome every few paragraphs fights that.
 */
export function LegalPage({
  title,
  subtitle,
  updated,
  tocLabel,
  summaryLabel,
  sections,
  docs,
}: {
  title: string;
  subtitle: string;
  updated?: string;
  tocLabel: string;
  /** Prefix on each section's plain-language line, e.g. "In short". */
  summaryLabel?: string;
  sections: LegalSection[];
  /** Every legal document, this one included — rendered as a switcher. */
  docs?: LegalCrossLink[];
}) {
  const isMobile = useIsMobile();
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const activeTitle = sections.find((s) => s.id === activeSection)?.title ?? tocLabel;

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
      <nav aria-labelledby="legal-toc-heading" className="border-l border-border/60">
        {sections.map((section, i) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            aria-current={activeSection === section.id ? "true" : undefined}
            className={cn(
              "-ml-px flex w-full items-baseline gap-2.5 border-l py-1.5 pl-4 pr-2 text-left text-[13px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeSection === section.id
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <span aria-hidden="true" className="shrink-0 tabular-nums text-muted-foreground/60">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">{section.title}</span>
          </button>
        ))}
      </nav>
    ),
    [sections, activeSection],
  );

  return (
    <div className="min-h-screen bg-background">
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
        className="fixed inset-x-0 top-0 z-50 h-px bg-transparent"
      >
        <div
          className="h-full bg-foreground/50 transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[78rem] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <WordmarkLogo className="text-base" />
          </Link>

          {docs && docs.length > 0 && (
            <div className="ml-2 hidden items-center gap-0.5 md:flex">
              {docs.map((doc) => (
                <Link
                  key={doc.href}
                  href={doc.href}
                  aria-current={pathname === doc.href ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    pathname === doc.href
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {doc.label}
                </Link>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="max-w-[45vw] text-muted-foreground"
              >
                <List className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{activeTitle}</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href="/">
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">{tCommon("back")}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl">
            <SheetTitle>{tocLabel}</SheetTitle>
            <div className="mt-4">{nav}</div>
            {docs && docs.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border/60 pt-4">
                {docs.map((doc) => (
                  <Link
                    key={doc.href}
                    href={doc.href}
                    className={cn(
                      "rounded-lg border border-border/70 px-2.5 py-1.5 text-[13px]",
                      pathname === doc.href
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {doc.label}
                  </Link>
                ))}
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}

      <main id="legal-content" className="mx-auto max-w-[78rem] px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <div className="max-w-[46rem] space-y-3 pb-10">
          {updated && (
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {updated}
            </p>
          )}
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-[2.5rem] sm:leading-[1.1]">
            {title}
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {subtitle}
          </p>
        </div>

        <div className="relative flex gap-12">
          {!isMobile && (
            <aside className="sticky top-24 order-2 max-h-[calc(100vh-8rem)] w-60 shrink-0 self-start overflow-y-auto">
              <h2
                id="legal-toc-heading"
                className="mb-2 pl-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {tocLabel}
              </h2>
              {nav}
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                tabIndex={-1}
                className="scroll-mt-24 border-t border-border/60 py-9 first:border-t-0 first:pt-0 focus:outline-none"
              >
                <div className="max-w-[46rem]">
                  <div className="group/heading flex items-baseline gap-2">
                    {/* Same number the rail shows, so "see 04" points at
                        something the reader can actually find. */}
                    <h2 className="flex items-baseline gap-3 font-display text-xl font-semibold tracking-tight">
                      <span className="shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">{section.title}</span>
                    </h2>
                    <AnchorLink id={section.id} label={section.title} />
                  </div>

                  {section.summary && (
                    <p className="mt-3 border-l-2 border-border pl-4 text-[14px] leading-relaxed text-muted-foreground">
                      {summaryLabel && (
                        <span className="font-medium text-foreground/80">{summaryLabel}: </span>
                      )}
                      {section.summary}
                    </p>
                  )}

                  <div className="mt-4 space-y-4 text-[15px] leading-[1.75] text-foreground/85">
                    {section.paragraphs?.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {CONTACT_SECTION_IDS.has(section.id) && (
                      <ContactBox full={FULL_LEGAL_SECTION_IDS.has(section.id)} />
                    )}
                    {section.list && (
                      <ul className="space-y-2.5 pl-5">
                        {section.list.map((item, i) => (
                          <li key={i} className="list-disc marker:text-muted-foreground/60">
                            {item.title && (
                              <strong className="font-semibold text-foreground">
                                {item.title}:{" "}
                              </strong>
                            )}
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    {section.note && (
                      <p className="rounded-xl border border-border/60 bg-muted/25 p-4 text-[13.5px] leading-relaxed text-muted-foreground">
                        {section.note}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ))}

            <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-6">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {docs
                  ?.filter((doc) => doc.href !== pathname)
                  .map((doc) => (
                    <Link
                      key={doc.href}
                      href={doc.href}
                      className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {doc.label}
                    </Link>
                  ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className={cn(
                  "shrink-0 text-muted-foreground transition-opacity",
                  showBackToTop ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
                {tCommon("backToTop")}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
