import { cn } from "@/lib/utils";

/**
 * The page's background field, rendered once behind every section rather than
 * per-section.
 *
 * Two jobs. The column rules run the full height of the document, so the
 * sections read as bands of one continuous grid instead of separate slabs
 * stacked on each other. And the hero wash is deliberately much taller than
 * the hero — it bleeds down through the sections beneath it and fades out
 * around the second screenful, so the top of the page resolves gradually
 * instead of ending at a hard edge.
 */
export const PageField = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    <div className="field-rules absolute inset-0 opacity-55" />

    <div
      className="absolute inset-x-0 top-0 h-[190vh]"
      style={{
        background: [
          "radial-gradient(70% 55% at 18% 2%, color-mix(in oklch, var(--primary) 26%, transparent), transparent 68%)",
          "radial-gradient(65% 50% at 88% 0%, color-mix(in oklch, var(--secondary) 20%, transparent), transparent 70%)",
          "radial-gradient(90% 40% at 50% 32%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 75%)",
        ].join(","),
        maskImage: "linear-gradient(to bottom, black 0%, black 38%, transparent 96%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 38%, transparent 96%)",
      }}
    />
  </div>
);

/**
 * A full-bleed hatched band. Sits between sections as a visual joint — the
 * striped strip that carries the eye from one band into the next.
 */
export const HatchBand = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("hatch h-10 border-y border-rule opacity-70", className)} />
);
