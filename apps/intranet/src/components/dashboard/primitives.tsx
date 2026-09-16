"use client";

import type { ReactNode } from "react";

import { Link } from "@/components/Link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One block of a dashboard section. No surface of its own — the section it
 * sits in draws the ground and the hairlines between blocks. */
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
  return (
    <section className="flex h-full min-w-0 flex-col">
      <div data-dashboard-card-header className="flex items-center gap-2 px-4 pb-1.5 pt-4">
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{title}</h2>
        {count ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <div data-dashboard-card-content className="flex-1 px-1.5 pb-2.5">
        {children}
      </div>
    </section>
  );
}

/** A dashboard section's single surface: blocks sit side by side, split by
 * hairlines instead of each being its own card. The inner grid overhangs by a
 * pixel so the outer edge's borders get clipped away. */
export function DashSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div
        className={cn(
          "-mb-px -mr-px grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60",
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
    <div className="px-2.5 py-5 text-center">
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
      className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/60"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>
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
        className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/60"
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
