import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A page section in the technical layout: full-bleed hairline on top, the
 * shared container width inside, and an optional index marker (`03 / BRANDS`)
 * that sits in the left gutter on wide screens and folds inline below that.
 *
 * Every marketing page composes these so section rhythm is decided in one
 * place rather than re-invented per page with ad-hoc `py-24` values.
 */
export const Section = ({
  id,
  index,
  label,
  children,
  className,
  innerClassName,
  bordered = true,
  size = "normal",
}: {
  id?: string;
  /** Two-digit section number shown in the gutter marker. */
  index?: string;
  /** Short uppercase name shown next to the index. */
  label?: string;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  bordered?: boolean;
  size?: "tight" | "normal" | "loose";
}) => {
  const padding = {
    tight: "py-14 md:py-20",
    normal: "py-20 md:py-28",
    loose: "py-24 md:py-36",
  }[size];

  return (
    <section
      id={id}
      className={cn("relative", bordered && "border-t border-rule", padding, className)}
    >
      <div className={cn("mx-auto w-full max-w-[1440px] px-5 md:px-10", innerClassName)}>
        {index || label ? <SectionMarker index={index} label={label} /> : null}
        {children}
      </div>
    </section>
  );
};

/**
 * The marker is deliberately not a heading — it is a locator, like a figure
 * number on a drawing, so it stays out of the document outline.
 */
export const SectionMarker = ({
  index,
  label,
  className,
}: {
  index?: string;
  label?: string;
  className?: string;
}) => (
  <div
    aria-hidden
    className={cn(
      "mb-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.28em] text-muted-foreground/70 md:mb-12",
      className,
    )}
  >
    {index ? <span className="text-primary">{index}</span> : null}
    <span className="h-px w-8 bg-rule-strong" />
    {label ? <span className="uppercase">{label}</span> : null}
  </div>
);
