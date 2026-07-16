import Image from "next/image";

import { useSingleLetterLogo } from "@/hooks/use-logo";
import { cn } from "@/lib/utils";

/** Plain-text wordmark for the Performance login/setup pages — matches
 * `BrandLogo`'s "ADVANTIS / tagline" structure, but in the Advantis brand
 * color with "Performance" as the tagline instead of "All about sales". */
export function PerformanceBrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center leading-none",
        className
      )}
    >
      <span className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-advantis">
        Advantis
      </span>
      <span className="mt-2 text-[0.5rem] font-medium uppercase tracking-[0.45em] text-muted-foreground">
        Performance
      </span>
    </span>
  );
}

/** Compact single-line mark for the Performance header bars — mirrors
 * `WordmarkLogo` (single-letter icon + "Advantis" in brand color), with
 * "Performance" instead of "Group". Says "Performance" once, so it isn't
 * paired with a separate badge that repeats it. */
export function PerformanceWordmark({ className }: { className?: string }) {
  const src = useSingleLetterLogo();
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-base font-bold tracking-tight",
        className
      )}
    >
      <span className="relative mr-1 size-6 shrink-0">
        <Image
          src={src}
          alt="Advantis"
          fill
          sizes="24px"
          priority
          className="object-contain"
        />
      </span>
      <span className="text-advantis">Advantis</span>
      <span className="text-foreground">Performance</span>
    </span>
  );
}
