import type { ComponentType } from "react";

import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Inline SVG flags. Unlike emoji flags (which render as bare country-code
 * letters on Windows), these draw consistently on every platform — so a flag
 * is an actual flag everywhere.
 */

function FlagDE({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 5 3" preserveAspectRatio="none" className={className} aria-hidden>
      <rect width="5" height="3" fill="#000000" />
      <rect width="5" height="2" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" className={className} aria-hidden>
      <clipPath id="flag-gb-clip">
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <g clipPath="url(#flag-gb-clip)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0 60 30M60 0 0 30" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M0 0 60 30M60 0 0 30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

const FLAG_BY_LOCALE: Record<Locale, ComponentType<{ className?: string }>> = {
  de: FlagDE,
  en: FlagGB,
};

/** Rounded flag chip for a given locale. */
export function LocaleFlag({ locale, className }: { locale: Locale; className?: string }) {
  const Flag = FLAG_BY_LOCALE[locale];
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10",
        className,
      )}
    >
      <Flag className="h-full w-full" />
    </span>
  );
}
