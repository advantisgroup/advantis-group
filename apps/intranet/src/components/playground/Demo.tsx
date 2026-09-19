import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One exhibit on a `/playground` page: what it is, a line on why it works the way it
 * does, where the real one lives, and the live thing itself.
 */
export function Demo({
  title,
  description,
  source,
  action,
  className,
  children,
}: {
  title: string;
  description: string;
  /** Where the real component lives, e.g. `components/ui/button.tsx`. */
  source?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
          {source && (
            <p className="mt-1.5 font-mono text-[11.5px] text-muted-foreground/75">{source}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn("rounded-xl border border-border/70 bg-card p-5", className)}>
        {children}
      </div>
    </section>
  );
}
