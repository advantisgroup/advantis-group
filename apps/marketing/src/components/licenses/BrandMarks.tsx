"use client";

import { useState } from "react";

import { Globe, Package } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The npm mark, drawn inline rather than fetched — it is the one logo that is
 * simple enough to reproduce exactly, and the npm button is on every card's
 * dialog, so a network request for it would be waste.
 */
export const NpmMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
    <rect width="24" height="24" rx="2" fill="#CB3837" />
    <path d="M4 7h16v10h-8v-8H9v8H4V7z" fill="#fff" />
    <path d="M15 10h2v5h-2v-5z" fill="#CB3837" />
  </svg>
);

/**
 * A remote brand mark with a local fallback.
 *
 * `<img>` rather than `next/image` on purpose: these point at 103 different
 * GitHub owners plus arbitrary publisher domains, which would mean either a
 * sprawling `remotePatterns` allowlist or routing every avatar through the
 * optimiser for no benefit at this size. Lazy so only the cards actually
 * scrolled into view fetch anything, and any failure — 404, blocked request,
 * offline — silently falls back to the glyph.
 */
export const BrandIcon = ({
  src,
  alt,
  className,
  fallback = "package",
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallback?: "package" | "globe";
}) => {
  const [failed, setFailed] = useState(false);
  const Fallback = fallback === "globe" ? Globe : Package;

  if (!src || failed) {
    return (
      <Fallback className={cn("shrink-0 text-muted-foreground", className)} strokeWidth={1.5} />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("shrink-0 border border-rule object-cover", className)}
    />
  );
};
