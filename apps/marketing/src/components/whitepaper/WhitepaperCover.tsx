import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

/**
 * A stand-in for the document itself. The whitepaper has no cover artwork, and
 * a gated asset the visitor can't see is a weaker offer than one they can — so
 * the page shows a sheet rather than another icon.
 *
 * The sheet is paper, not a red gradient tile with a coloured drop shadow.
 * What it is standing in for is a printed document; dressing it as a product
 * badge made it look like a button nobody could press.
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
        className="absolute inset-0 -rotate-6 rounded-lg border border-rule bg-card"
      />
      <div
        aria-hidden
        className="absolute inset-0 -rotate-3 rounded-lg border border-rule bg-card"
      />

      <div
        className={cn(
          "relative flex h-full flex-col justify-between overflow-hidden rounded-lg border border-rule bg-card shadow-panel",
          large ? "p-5" : "p-3",
        )}
      >
        <Logo variant="markBrand" height={large ? 18 : 10} />

        <div className={large ? "space-y-4" : "space-y-2"}>
          <span
            className={cn(
              "font-display block font-medium leading-tight",
              large ? "text-xl" : "text-[10px]",
            )}
          >
            {title}
          </span>
          <div aria-hidden className={large ? "space-y-2" : "space-y-1"}>
            <div className="h-px w-full bg-rule" />
            <div className="h-px w-4/5 bg-rule" />
            <div className="h-px w-3/5 bg-rule" />
          </div>
        </div>
      </div>
    </div>
  );
}
