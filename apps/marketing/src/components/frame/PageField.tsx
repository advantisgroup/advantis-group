import { cn } from "@/lib/utils";

/**
 * The page's background field, rendered once behind every section.
 *
 * It deliberately does *not* draw a full column grid any more. Rules running
 * the width of the page cut straight through headlines and body copy, which
 * reads as damage rather than structure. Hairlines belong against UI — panel
 * edges, grid cells, table rows — where they border something; those live on
 * the components themselves.
 *
 * What is left here is the pair of boundary rules marking the content
 * measure, which text never touches because it sits inside the container's
 * padding, and the hero wash: much taller than the hero so it bleeds down
 * through the sections beneath and fades out around the second screenful,
 * rather than ending at a hard edge.
 */
export const PageField = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    <div className="mx-auto h-full w-full max-w-[1440px]">
      <div className="flex h-full justify-between">
        <span className="h-full w-px bg-rule" />
        <span className="h-full w-px bg-rule" />
      </div>
    </div>

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
