"use client";

import { cn } from "@/lib/utils";

interface SectionDividerProps {
  variant?: "wave" | "curve" | "dots" | "line";
  className?: string;
  flip?: boolean;
  opacity?: number;
}

export const SectionDivider = ({
  variant = "wave",
  className,
  flip = false,
  opacity = 0.1,
}: SectionDividerProps) => {
  if (variant === "wave") {
    return (
      <div
        className={cn("w-full overflow-hidden", className)}
        style={{ transform: flip ? "scaleY(-1)" : undefined }}
      >
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="w-full h-12 md:h-16"
          style={{ opacity }}
        >
          <path
            d="M0,0 C150,60 350,0 600,40 C850,80 1050,20 1200,60 L1200,120 L0,120 Z"
            fill="currentColor"
            className="text-primary"
          />
        </svg>
      </div>
    );
  }

  if (variant === "curve") {
    return (
      <div
        className={cn("w-full overflow-hidden", className)}
        style={{ transform: flip ? "scaleY(-1)" : undefined }}
      >
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="w-full h-12 md:h-16"
          style={{ opacity }}
        >
          <path
            d="M0,0 Q600,120 1200,0 L1200,120 L0,120 Z"
            fill="currentColor"
            className="text-primary"
          />
        </svg>
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={cn("w-full flex justify-center gap-2 py-8", className)}>
        {[...Array<number>(5)].map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary"
            style={{ opacity: opacity * (i === 2 ? 2 : 1) }}
          />
        ))}
      </div>
    );
  }

  if (variant === "line") {
    return (
      <div className={cn("w-full flex justify-center py-8", className)}>
        <div className="w-24 h-px bg-primary" style={{ opacity }} />
      </div>
    );
  }

  return null;
};
