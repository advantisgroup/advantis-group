import { cn } from "@/lib/utils";

/**
 * The vertical column hairlines, absolutely positioned behind a section's
 * content. Purely decorative structure, so it is hidden from assistive tech
 * and never intercepts pointer events.
 */
export const FieldRules = ({
  className,
  fade = true,
}: {
  className?: string;
  /** Fade the rules out top and bottom so they don't collide with section borders. */
  fade?: boolean;
}) => (
  <div
    aria-hidden
    className={cn("field-rules pointer-events-none absolute inset-0 opacity-60", className)}
    style={
      fade
        ? {
            maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
          }
        : undefined
    }
  />
);
