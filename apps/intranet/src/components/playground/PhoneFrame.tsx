import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Narrows a demo to a phone's width (375px), so a layout can be checked
 *  without resizing the window. Width only: hooks that ask "is this a phone?"
 *  still read the real window. */
export function PhoneFrame({
  on = true,
  label,
  className,
  children,
}: {
  on?: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!on) return <div className={className}>{children}</div>;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "w-full max-w-[375px] overflow-hidden rounded-[28px] border-[6px] border-foreground/10 bg-background shadow-sm",
          className,
        )}
      >
        {children}
      </div>
      {label && <p className="font-mono text-[11px] text-muted-foreground">{label}</p>}
    </div>
  );
}
