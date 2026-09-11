import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A group of settings: what the group is about on the left, its rows on the
 * right (stacked on mobile). Rows save as they change, so there's no form
 * footer and no card per setting.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-x-6 gap-y-3 md:grid-cols-[15rem_minmax(0,1fr)]", className)}>
      <header className="md:pt-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 max-w-[28ch] text-[13px] text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </header>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {children}
      </div>
    </section>
  );
}

/** One setting: label and one-line description left, its control right. */
export function SettingsRow({
  title,
  description,
  control,
  children,
}: {
  /** Usually text; a provider logo where the setting is about that service. */
  title: ReactNode;
  description?: string;
  control?: ReactNode;
  /** Shown under the row, e.g. a warning about the setting's current state. */
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">{title}</div>
          {description && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  );
}
