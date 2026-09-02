import { cn } from "@/lib/utils";

/**
 * A stand-in for the document itself. The whitepaper has no cover artwork, and
 * a gated asset the visitor can't see is a weaker offer than one they can — so
 * the page shows a sheet rather than another icon.
 */
export function WhitepaperCover({
  title,
  className,
  size = "sm",
}: {
  title: string;
  className?: string;
  /** The type scale has to follow the box, or a large sheet reads as a label. */
  size?: "sm" | "lg";
}) {
  const large = size === "lg";

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        aria-hidden
        className="absolute inset-0 -rotate-6 rounded-lg border border-border/60 bg-card"
      />
      <div
        aria-hidden
        className="absolute inset-0 -rotate-3 rounded-lg border border-border/60 bg-card"
      />
      <div
        className={cn(
          "relative flex h-full flex-col justify-between overflow-hidden rounded-lg border border-advantis/40 bg-linear-to-br from-advantis to-advantis/75 text-white shadow-lg shadow-advantis/25",
          large ? "rounded-xl p-5" : "p-3",
        )}
      >
        <span
          className={cn(
            "font-semibold uppercase tracking-[0.2em] text-white/85",
            large ? "text-xs" : "text-[9px]",
          )}
        >
          PDF
        </span>
        <div className={large ? "space-y-4" : "space-y-2"}>
          <span
            className={cn(
              "font-[family-name:var(--font-outfit)] block font-semibold leading-tight",
              large ? "text-xl" : "text-[10px]",
            )}
          >
            {title}
          </span>
          <div aria-hidden className={large ? "space-y-2" : "space-y-1"}>
            <div className="h-px w-full bg-white/40" />
            <div className="h-px w-4/5 bg-white/30" />
            <div className="h-px w-3/5 bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
