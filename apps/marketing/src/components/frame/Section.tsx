import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Display } from "./Display";
import { Eyebrow } from "./Eyebrow";

/**
 * A page section: the shared container width and vertical rhythm, nothing
 * else. Sections are separated by a single hairline and a lot of air — the
 * air is doing most of the work, so the rhythm is deliberately generous.
 */
export const Section = ({
  id,
  children,
  className,
  innerClassName,
  bordered = true,
  size = "normal",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  bordered?: boolean;
  size?: "tight" | "normal" | "loose";
}) => {
  // Mobile gets noticeably less air: at 390px wide, desktop's padding put
  // roughly a third of a screen of nothing between every pair of sections.
  const padding = {
    tight: "py-12 md:py-20",
    normal: "py-16 md:py-28",
    loose: "py-20 md:py-40",
  }[size];

  return (
    <section
      id={id}
      className={cn("relative", bordered && "border-t border-rule", padding, className)}
    >
      <div className={cn("relative mx-auto w-full max-w-[1200px] px-5 md:px-10", innerClassName)}>
        {children}
      </div>
    </section>
  );
};

/**
 * The way every page starts: title, one paragraph, and the air around them.
 *
 * Centred, because it is the only thing on screen when it lands, and because
 * it makes the page's own sections — which set flush left — read as the body
 * that follows an opening rather than more of the same.
 */
export const PageHeader = ({
  title,
  lede,
  children,
  className,
}: {
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
}) => (
  <header className={cn("pt-32 pb-16 md:pt-44 md:pb-24", className)}>
    <div className="mx-auto w-full max-w-[1200px] px-5 text-center md:px-10">
      <Display as="h1" size="xl" className="mx-auto max-w-[18ch]">
        {title}
      </Display>
      {lede ? (
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {lede}
        </p>
      ) : null}
      {children ? <div className="mt-8 flex justify-center">{children}</div> : null}
    </div>
  </header>
);

/**
 * The opener a section shares with every other one: an optional label, the
 * heading, and at most one line of lede. Centred by default — the pages read
 * as a sequence of announcements, and a centred opener is what tells the eye
 * a new one has started.
 */
export const SectionHead = ({
  label,
  title,
  lede,
  align = "center",
  size = "lg",
  className,
  children,
}: {
  label?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  align?: "center" | "left";
  size?: "md" | "lg";
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col",
      align === "center" ? "mx-auto max-w-3xl items-center text-center" : "max-w-3xl items-start",
      className,
    )}
  >
    {label ? <Eyebrow className="mb-4">{label}</Eyebrow> : null}
    <Display size={size}>{title}</Display>
    {lede ? (
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
        {lede}
      </p>
    ) : null}
    {children}
  </div>
);
