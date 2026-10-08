"use client";

import { type ReactNode } from "react";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/** A plain A4-ish sheet for printing / "Als PDF speichern" in the browser
 * print dialog. The toolbar disappears in print. */
export function PrintFrame({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations("Performance.checks");
  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <style>
        {
          "@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } }"
        }
      </style>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2 print:hidden">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          {t("print")}
        </Button>
      </div>
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-[11px] leading-snug text-black shadow print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </div>
  );
}
