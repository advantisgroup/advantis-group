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
      <div className={cn("relative mx-auto w-full max-w-[1440px] px-5 md:px-10", innerClassName)}>
        {children}
      </div>
    </section>
  );
};
