import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A page section: the shared container width and vertical rhythm, nothing
 * else. It deliberately has no label slot — section headings identify
 * themselves, and the small uppercase kicker that used to sit above every one
 * of them made all seven sections open the same way.
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
    tight: "py-10 md:py-20",
    normal: "py-14 md:py-28",
    loose: "py-16 md:py-36",
  }[size];

  return (
    <section
      id={id}
      className={cn("relative", bordered && "border-t border-rule", padding, className)}
    >
      <div className={cn("relative mx-auto w-full max-w-[1440px] px-5 md:px-10", innerClassName)}>
        {children}
      </div>
    </section>
  );
};
