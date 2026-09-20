import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A drawn glyph per service.
 *
 * Not icons off a shelf: the twelve services were carrying eleven generic
 * lucide pictograms and a repeat, so three of them were a telephone and two
 * were a group of people. These are one family — a single 32-unit grid, one
 * stroke weight, no fills — so a row of them reads as a set rather than as
 * twelve borrowed symbols, and each one draws the thing its service actually
 * does.
 *
 * Stroke, never fill, and `currentColor` throughout: they inherit the colour
 * of whatever they sit in and work on both grounds without a second copy.
 */

const GLYPHS: Record<string, ReactNode> = {
  /* A headset: the band, the pads, the boom. */
  "customer-care": (
    <>
      <path d="M7 19v-4a9 9 0 0 1 18 0v4" />
      <rect x="3.5" y="18" width="4.5" height="7" rx="2.25" />
      <rect x="24" y="18" width="4.5" height="7" rx="2.25" />
      <path d="M24 25v1.5a3 3 0 0 1-3 3h-4" />
    </>
  ),

  /* A hub reaching four channels at once. */
  "contact-center": (
    <>
      <circle cx="16" cy="16" r="3.5" />
      <path d="M13.5 13.5 8 8M18.5 13.5 24 8M13.5 18.5 8 24M18.5 18.5 24 24" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="26" cy="6" r="2" />
      <circle cx="6" cy="26" r="2" />
      <circle cx="26" cy="26" r="2" />
    </>
  ),

  /* A handset, mid-call. */
  telesales: (
    <>
      <path d="M9 5h4l2 5-2.5 1.8a13 13 0 0 0 6.7 6.7L21 16l5 2v4a3 3 0 0 1-3 3C14 25 6 17 6 8a3 3 0 0 1 3-3Z" />
      <path d="M20 4a8 8 0 0 1 8 8" />
      <path d="M20 9a3 3 0 0 1 3 3" />
    </>
  ),

  /* Someone new. */
  "new-customer-acquisition": (
    <>
      <circle cx="13" cy="11" r="5" />
      <path d="M4 27a9 9 0 0 1 18 0" />
      <path d="M23 8h6M26 5v6" />
    </>
  ),

  /* A journey that ends better than it started. */
  "customer-experience": (
    <>
      <path d="M4 25c6 0 6-9 12-9s6-9 12-9" />
      <circle cx="4" cy="25" r="1.75" />
      <circle cx="16" cy="16" r="1.75" />
      <path d="M28 3.5 29 6l2.5 1-2.5 1-1 2.5-1-2.5L24.5 7 27 6Z" />
    </>
  ),

  /* A spark with something in orbit around it. */
  "ai-automation": (
    <>
      <path d="M16 4c1 7.5 4.5 11 12 12-7.5 1-11 4.5-12 12-1-7.5-4.5-11-12-12 7.5-1 11-4.5 12-12Z" />
      <circle cx="27" cy="5" r="1.5" />
      <circle cx="5" cy="27" r="1.5" />
    </>
  ),

  /* Records, in order, each one a customer. */
  crm: (
    <>
      <rect x="5" y="5" width="22" height="6" rx="2" />
      <rect x="5" y="13" width="22" height="6" rx="2" />
      <rect x="5" y="21" width="22" height="6" rx="2" />
      <path d="M9.5 8h.01M9.5 16h.01M9.5 24h.01" />
    </>
  ),

  /* An open book. */
  "sales-academy": (
    <>
      <path d="M16 9c-3-2.5-7-3-11-2.5v17c4-.5 8 0 11 2.5" />
      <path d="M16 9c3-2.5 7-3 11-2.5v17c-4-.5-8 0-11 2.5" />
      <path d="M16 9v17.5" />
    </>
  ),

  /* A funnel: many in, the right ones out. */
  "lead-management": (
    <>
      <path d="M4 8h24l-9 10.5V27l-6-3v-5.5Z" />
      <path d="M9 4h.01M16 4h.01M23 4h.01" />
    </>
  ),

  /* Two teams, one overlap. */
  "sales-outsourcing": (
    <>
      <circle cx="12" cy="16" r="8.5" />
      <circle cx="20" cy="16" r="8.5" />
      <circle cx="16" cy="16" r="1.75" />
    </>
  ),

  /* Ground gained, one step at a time. */
  "business-development": (
    <>
      <path d="M4 27h6v-7h6v-7h6V6h6" />
      <path d="M23 6h5v5" />
    </>
  ),

  /* Practice, until it lands. */
  vertriebstraining: (
    <>
      <circle cx="15" cy="17" r="11" />
      <circle cx="15" cy="17" r="6" />
      <circle cx="15" cy="17" r="1.5" />
      <path d="M15 17 28 4" />
      <path d="M28 4h-5M28 4v5" />
    </>
  ),
};

export const hasServiceGlyph = (slug: string) => slug in GLYPHS;

export const ServiceGlyph = ({ slug, className }: { slug: string; className?: string }) => {
  const paths = GLYPHS[slug];
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("size-8", className)}
    >
      {paths}
    </svg>
  );
};
