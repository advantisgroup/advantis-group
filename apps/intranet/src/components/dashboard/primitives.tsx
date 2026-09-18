"use client";

import { createContext, useContext, type ReactNode, type Ref } from "react";

import { Link } from "@/components/Link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type DashCardSize = "compact" | "normal" | "wide";

export const DashCardSizeContext = createContext<DashCardSize>("normal");

/** One block of a dashboard section. No surface of its own — the section it
 * sits in draws the ground and the hairlines between blocks. Its size is set
 * per card by the person: compact keeps the first three rows on one line
 * each, wide lays the rows out in two columns. */
export function DashCard({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const size = useContext(DashCardSizeContext);
  return (
    <section className="flex h-full min-w-0 flex-col">
      <div
        data-dashboard-card-header
        className={cn(
          "flex items-center gap-2 px-4",
          size === "compact" ? "pb-1 pt-3" : "pb-1.5 pt-4",
        )}
      >
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{title}</h2>
        {count ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <div
        data-dashboard-card-content
        className={cn(
          "flex-1 px-1.5",
          size === "compact" &&
            "pb-1.5 [&_[data-dashboard-row]:nth-child(n+4)]:hidden [&_[data-dashboard-row]]:py-1.5 [&_[data-row-subtitle]]:hidden",
          size === "normal" && "pb-2.5",
          size === "wide" && "pb-2.5 sm:grid sm:grid-cols-2 sm:content-start sm:gap-x-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** A dashboard section's single surface: blocks sit side by side, split by
 * hairlines instead of each being its own card. The inner grid overhangs by a
 * pixel so the outer edge's borders get clipped away. While editing, the
 * blocks come apart into separate tiles so each reads as something to grab. */
export function DashSurface({
  children,
  className,
  editing,
  gridRef,
}: {
  children: ReactNode;
  className?: string;
  editing?: boolean;
  gridRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl transition-colors duration-300",
        editing ? "border border-transparent" : "overflow-hidden border border-border/70 bg-card",
      )}
    >
      <div
        ref={gridRef}
        className={cn(
          "relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
          editing
            ? "gap-3 [&>*]:rounded-2xl [&>*]:border [&>*]:border-border/70 [&>*]:bg-card"
            : "-mb-px -mr-px [&>*]:border-b [&>*]:border-r [&>*]:border-border/60",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Empty({
  children,
  href,
  linkLabel,
}: {
  children: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="col-span-full px-2.5 py-3 text-center sm:py-5">
      <p className="text-sm text-muted-foreground">{children}</p>
      {href && linkLabel && (
        <Link
          href={href}
          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function RowSkeletons() {
  return (
    <div className="space-y-2 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rich list row: optional leading visual, title, subtitle, trailing meta. */
export function Row({
  href,
  leading,
  title,
  subtitle,
  trailing,
}: {
  href: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      data-dashboard-row
      className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/60 active:bg-accent"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        {subtitle ? (
          <p data-row-subtitle className="truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {trailing}
        </div>
      ) : null}
    </Link>
  );
}

/** Compact icon + label + value line, for stat-style widgets (not lists). */
export function StatLine({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        data-dashboard-row
        className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/60 active:bg-accent"
      >
        {content}
      </Link>
    );
  }
  return (
    <div data-dashboard-row className="flex items-center gap-3 px-2.5 py-2">
      {content}
    </div>
  );
}
