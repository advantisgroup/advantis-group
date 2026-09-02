"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A continuously scrolling strip. The children are rendered twice and the
 * track translates by exactly -50%, so the loop is seamless without measuring
 * anything at runtime. The duplicate copy is hidden from assistive tech so
 * screen readers don't hear the content twice.
 */
export const Marquee = ({
  children,
  durationSeconds = 40,
  className,
}: {
  children: ReactNode;
  durationSeconds?: number;
  className?: string;
}) => (
  <div
    className={cn("relative flex overflow-hidden", className)}
    style={{
      maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
      WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
    }}
  >
    <div
      className="animate-marquee flex w-max shrink-0 items-center"
      style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
    >
      <div className="flex shrink-0 items-center">{children}</div>
      <div aria-hidden className="flex shrink-0 items-center">
        {children}
      </div>
    </div>
  </div>
);
