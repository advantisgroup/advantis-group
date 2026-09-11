"use client";

import type { ReactNode } from "react";

import { Link } from "@/components/Link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    <Card className="group/card h-full overflow-hidden transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-18px_rgb(0_0_0/0.18)] refreshed:hover:shadow-none">
      <div
        data-dashboard-card-header
        className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-[18px]">
          {icon}
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold tracking-tight">{title}</h2>
        {count ? (
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold tabular-nums text-primary">
            {count}
          </span>
        ) : null}
      </div>
      <div data-dashboard-card-content className="p-2">
        {children}
      </div>
    </Card>
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
    <div className="px-3 py-6 text-center">
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
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
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        data-dashboard-row
        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
      >
        {content}
      </Link>
    );
  }
  return (
    <div data-dashboard-row className="flex items-center gap-3 px-3 py-2">
      {content}
    </div>
  );
}
