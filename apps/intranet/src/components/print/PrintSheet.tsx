"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import { useLocale, useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { RichText } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

const InPrintSheet = createContext(false);

/** True inside a `PrintSheet`, for shared content (a guidebook body) that has
 *  a screen-only affordance to drop on paper. */
export function useInPrintSheet(): boolean {
  return useContext(InPrintSheet);
}

/**
 * The paper version of a page. A screen layout doesn't survive the printer —
 * inputs print as empty boxes, sidebars and cards eat the width, controls
 * print as dead ink — so a page that offers "Print" mounts one of these with a
 * layout built for a sheet of A4 instead. It stays hidden on screen and, while
 * mounted, is the only thing that prints (see globals.css), so Ctrl+P gets the
 * same document as the page's own button.
 *
 * The head and foot are a table's header and footer rows because those are
 * what a browser repeats on every sheet; their padding is the page margin.
 */
export function PrintSheet({
  title,
  area,
  kind,
  notice,
  children,
}: {
  /** The document title while printing — what "Save as PDF" names the file. */
  title: string;
  /** Which part of the intranet this came from, next to the logo. */
  area: string;
  /** What the document is ("Handoff brief"), at the right of the head. */
  kind: string;
  /** Fine print at the foot of every sheet, e.g. who may see it. */
  notice?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Common");
  const locale = useLocale();
  const user = useCurrentUser();
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

  const printed = new Date(printedAt).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return createPortal(
    <div className="print-sheet text-[10pt] leading-normal text-foreground">
      <table className="print-sheet-frame w-full border-collapse">
        <thead>
          <tr>
            <td className="px-[16mm] pt-[10mm]">
              <div className="mb-[8mm] flex items-center justify-between gap-6 border-b border-foreground/15 pb-[3mm]">
                <span className="flex items-center gap-3">
                  {/* A plain <img>: next/image lazy-loads, and a lazy image
                      inside a hidden sheet has never loaded by print time. */}
                  <img
                    src="/logos/advantis-group-lockup.svg"
                    alt="Advantis Group"
                    className="h-[3.6mm] w-auto"
                  />
                  <span className="border-l border-foreground/20 pl-3 text-[8pt] text-muted-foreground">
                    {area}
                  </span>
                </span>
                <span className="text-[7.5pt] font-semibold uppercase tracking-[0.14em]">
                  {kind}
                </span>
              </div>
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td className="px-[16mm] pb-[9mm]">
              <div className="mt-[8mm] flex items-start justify-between gap-8 border-t border-foreground/15 pt-[2.5mm] text-[7.5pt] text-muted-foreground">
                <span>{notice}</span>
                <span className="shrink-0 tabular-nums">
                  {t("printedBy", { date: printed, name: user.name })}
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="px-[16mm] align-top">
              <InPrintSheet.Provider value>{children}</InPrintSheet.Provider>
            </td>
          </tr>
        </tbody>
      </table>
    </div>,
    host,
  );
}

/** The document's own title block: what it is, whose it is, and a line of
 *  facts under it. */
export function PrintTitle({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-[8mm]">
      {eyebrow && (
        <p className="text-[8pt] font-semibold uppercase tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-[1.5mm] text-[21pt] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
        {title}
      </h1>
      {lead && <p className="mt-[1mm] text-[11pt] text-muted-foreground">{lead}</p>}
      {children && (
        <div className="mt-[3mm] flex flex-wrap gap-x-[6mm] gap-y-1 text-[9pt] text-muted-foreground">
          {children}
        </div>
      )}
    </header>
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
    <section className={cn("mt-[7mm] first:mt-0", className)}>
      <h2 className="mb-[3mm] border-b border-foreground/15 pb-[1.5mm] text-[7.5pt] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface PrintField {
  label: string;
  value: ReactNode;
  /** Spans the whole row — an address, a note. */
  wide?: boolean;
}

/** Label-over-value pairs in columns: the paper form of a details card. */
export function PrintFields({ items, columns = 2 }: { items: PrintField[]; columns?: 2 | 3 }) {
  return (
    <dl
      className={cn(
        "grid gap-x-[8mm] gap-y-[3.5mm]",
        columns === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn("break-inside-avoid", item.wide && "col-span-full")}>
          <dt className="text-[7pt] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-[0.75mm] whitespace-pre-line text-[10pt] [overflow-wrap:anywhere]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Stored rich text (notes, CV fields) at paper size. Dates in it are left
 *  alone — the screen copy already offers to save them to the calendar. */
export function PrintRichText({ html }: { html: string }) {
  return <RichText html={html} autoSaveDates={false} className="text-[10pt] leading-relaxed" />;
}
