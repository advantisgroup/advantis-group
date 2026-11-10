"use client";

import { type DeltaFormat, DeltaPair } from "@/components/performance/PerformanceFormat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/** The Überblick's KPI cards: a big one with a coloured top edge, and the
 * smaller stat card — each with its "i" and the change against VM/VJ. */
export function PrimaryKpiCard({
  accent,
  label,
  value,
  subtitle,
  dVm,
  dVj,
  format,
  info,
}: {
  accent: "emerald" | "purple" | "slate" | "amber";
  label: string;
  /** Explanation behind the "i" in the corner. */
  info: string;
  value: string;
  subtitle?: string;
  dVm?: number;
  dVj?: number;
  format?: DeltaFormat;
}) {
  const border = {
    emerald: "border-t-emerald-500",
    purple: "border-t-purple-500",
    slate: "border-t-foreground/60",
    amber: "border-t-amber-500",
  }[accent];
  return (
    <Card className={cn("relative border-t-2", border)}>
      <InfoTip text={info} className="absolute right-3 top-3" />
      <CardContent className="flex flex-col gap-1.5 p-4 pr-8">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <DeltaPair dVm={dVm} dVj={dVj} format={format} />
      </CardContent>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  badge,
  dVm,
  dVj,
  info,
  format,
}: {
  label: string;
  value: string;
  badge?: string;
  info: string;
  dVm?: number;
  dVj?: number;
  format?: DeltaFormat;
}) {
  return (
    <Card className="relative">
      <InfoTip text={info} className="absolute right-3 top-3" />
      <CardContent className="flex flex-col gap-1.5 p-4 pr-8">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{value}</span>
          {badge && (
            <Badge variant="muted" className="text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        <DeltaPair dVm={dVm} dVj={dVj} format={format} />
      </CardContent>
    </Card>
  );
}
