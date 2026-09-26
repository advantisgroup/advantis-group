"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * The paper version of a page. The site's layout doesn't survive a printer —
 * the header, footer and every control print as dead ink, cards and the
 * serif's display sizes waste the sheet — so a page that offers "Print"
 * mounts one of these with a layout built for A4 instead. It stays hidden on
 * screen and, while mounted, is the only thing that prints (see global.css),
 * so Ctrl+P gets the same document as the page's own button.
 *
 * The head and foot are a table's header and footer rows because those are
 * what a browser repeats on every sheet; their padding is the page margin.
 */
export function PrintSheet({
  title,
  kind,
  reference,
  notice,
  children,
}: {
  /** The document title while printing — what "Save as PDF" names the file. */
  title: string;
  /** What the document is ("Inquiry"), at the right of the head. */
  kind: string;
  /** Printed after `kind`, so every sheet says which one it is. */
  reference?: string;
  /** Fine print at the foot of every sheet. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("print");
  const locale = useLocale();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [printedAt, setPrintedAt] = useState(() => Date.now());

  useEffect(() => {
    const root = document.documentElement;
    // The sheet's margins are its own head and foot rows, so the page gets
    // none — which also leaves the browser's date/title/URL header and footer
    // no room to draw. Injected here rather than as a named `@page` in the
    // stylesheet because Chrome stops repeating a table's footer row on a
    // named page.
    const page = document.createElement("style");
    page.textContent = "@page { margin: 0 !important }";
    document.head.appendChild(page);
    root.setAttribute("data-print-sheet", "");
    setHost(document.body);
    return () => {
      page.remove();
      root.removeAttribute("data-print-sheet");
    };
  }, []);

  useEffect(() => {
    let screenTitle: string | null = null;
    function before() {
      // Chrome can fire this twice for one print; keep the first, real title.
      screenTitle ??= document.title;
      document.title = title;
      // Committed before the browser lays the sheet out, so the time on
      // paper is when it was printed rather than when the page was opened.
      flushSync(() => setPrintedAt(Date.now()));
    }
    function after() {
      if (screenTitle !== null) document.title = screenTitle;
      screenTitle = null;
    }
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [title]);

  if (!host) return null;

  const printed = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(printedAt);

  return createPortal(
    <div className="print-sheet text-[10pt] leading-normal text-foreground">
      <table className="print-sheet-frame w-full border-collapse">
        <thead>
          <tr>
            <td className="px-[18mm] pt-[12mm]">
              <div className="mb-[10mm] flex items-center justify-between gap-6 border-b border-rule-strong pb-[3.5mm]">
                {/* A plain <img>: next/image lazy-loads, and a lazy image
                    inside a hidden sheet has never loaded by print time. */}
                <img
                  src="/logos/advantis-group-lockup-black.svg"
                  alt="ADVANTIS GROUP"
                  className="h-[3.4mm] w-auto"
                />
                <span className="text-[8pt] tracking-[0.08em] text-muted-foreground uppercase">
                  {kind}
                  {reference ? (
                    <span className="ml-[2mm] font-mono tracking-normal text-foreground normal-case">
                      {reference}
                    </span>
                  ) : null}
                </span>
              </div>
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td className="px-[18mm] pb-[10mm]">
              <div className="mt-[10mm] flex items-start justify-between gap-8 border-t border-rule-strong pt-[2.5mm] text-[7.5pt] text-muted-foreground">
                <span>{notice}</span>
                <span className="shrink-0 tabular-nums">{t("printed", { date: printed })}</span>
              </div>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="px-[18mm] align-top">{children}</td>
          </tr>
        </tbody>
      </table>
    </div>,
    host,
  );
}

export function PrintSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-[9mm]", className)}>
      <h2 className="mb-[3.5mm] border-b border-rule pb-[1.5mm] text-[8pt] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Label beside value, one per line: the paper form of a details list. */
export function PrintRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-rule">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[42mm_1fr] gap-x-[5mm] py-[1.75mm]">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="[overflow-wrap:anywhere]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
