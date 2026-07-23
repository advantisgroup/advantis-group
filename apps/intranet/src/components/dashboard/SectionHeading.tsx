"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionHeading({
  icon,
  title,
  tint,
}: {
  icon: ReactNode;
  title: string;
  tint?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
          tint ?? "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </span>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}
