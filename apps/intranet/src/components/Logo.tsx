"use client";

import Image from "next/image";

import { useSingleLetterLogo } from "@/hooks/use-logo";
import { cn } from "@/lib/utils";

/**
 * Full Advantis wordmark, rendered as text to match the new monochrome
 * "ADVANTIS / ALL ABOUT SALES" brand mark. Pass `tagline={false}` for tight
 * placements where only the wordmark should show.
 */
export function BrandLogo({
  className,
  tagline = true,
}: {
  className?: string;
  tagline?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex flex-col items-center leading-none text-foreground", className)}
    >
      <span className="font-display text-2xl font-semibold uppercase tracking-[0.3em]">
        Advantis
      </span>
      {tagline && (
        <span className="mt-2 text-[0.5rem] font-medium uppercase tracking-[0.45em] text-muted-foreground">
          All about sales
        </span>
      )}
    </span>
  );
}

/**
 * Single-letter mark + "AG Intranet" wordmark — "AG" in the Advantis brand color.
 */
export function WordmarkLogo({ className }: { className?: string }) {
  const src = useSingleLetterLogo();
  return (
    <span className={cn("flex items-center gap-1.5 text-lg font-bold tracking-tight", className)}>
      <span className="relative mr-1 size-7 shrink-0">
        <Image src={src} alt="Advantis" fill sizes="28px" priority className="object-contain" />
      </span>
      <span className="text-advantis">Advantis</span>
      <span className="text-foreground">Group</span>
    </span>
  );
}

/** Compact single-letter mark for collapsed nav / avatars. */
export function MarkLogo({ className, size = 32 }: { className?: string; size?: number }) {
  const src = useSingleLetterLogo();
  return (
    <Image
      src={src}
      alt="Advantis"
      width={size}
      height={size}
      priority
      className={cn("object-contain", className)}
    />
  );
}
