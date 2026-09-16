"use client";

import type { ReactNode } from "react";

export function SectionHeading({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <span className="h-px flex-1 bg-border/60" />
      {action}
    </div>
  );
}
