"use client";

import Image from "next/image";

import { useBrandLogo, useSingleLetterLogo } from "@/hooks/use-logo";
import { cn } from "@/lib/utils";

/** Full Advantis wordmark logo (theme-aware). */
export function BrandLogo({
  className,
  width = 132,
  height = 32,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  const src = useBrandLogo();
  return (
    <Image
      src={src}
      alt="Advantis Group"
      width={width}
      height={height}
      priority
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}

/**
 * Single-letter mark + "AG Intranet" wordmark — "AG" in the Advantis brand color.
 */
export function WordmarkLogo({ className }: { className?: string }) {
  const src = useSingleLetterLogo();
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-lg font-bold tracking-tight",
        className
      )}
    >
      <span className="relative mr-1 size-7 shrink-0">
        <Image
          src={src}
          alt="Advantis"
          fill
          sizes="28px"
          priority
          className="object-contain"
        />
      </span>
      <span className="text-advantis">Advantis</span>
      <span className="text-foreground">Group</span>
    </span>
  );
}

/** Compact single-letter mark for collapsed nav / avatars. */
export function MarkLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
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
