"use client";

import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * How a `SettingsSection` arranges its heading against its rows.
 *
 * `split` is the settings default: the group's name in a column of its own,
 * which reads well down a page of switches. `stacked` puts the name directly
 * above its rows — for pages that are mostly things to read rather than
 * things to change, where the wide column leaves a heading stranded a long
 * way from what it describes.
 */
type SettingsLayout = "split" | "stacked";

const SettingsLayoutContext = createContext<SettingsLayout>("split");

export function SettingsLayoutProvider({
  value,
  children,
}: {
  value: SettingsLayout;
  children: ReactNode;
}) {
  return <SettingsLayoutContext.Provider value={value}>{children}</SettingsLayoutContext.Provider>;
}

/**
 * A group of settings: what the group is about, then its rows. Rows save as
 * they change, so there's no form footer and no card per setting.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Sits with the heading — a link or button that belongs to the group. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const layout = useContext(SettingsLayoutContext);
  const split = layout === "split";

  return (
    <section
      className={cn(
        split
          ? "grid gap-x-10 gap-y-3 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]"
          : "space-y-3",
        className,
      )}
    >
      <header className={cn("flex items-start gap-3", split && "md:pt-3")}>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
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
