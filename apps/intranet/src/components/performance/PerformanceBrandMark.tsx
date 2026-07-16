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
