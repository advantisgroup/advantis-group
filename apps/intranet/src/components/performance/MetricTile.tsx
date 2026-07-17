import { type LucideIcon } from "lucide-react";

import { DeltaBadge } from "@/components/performance/PerformanceFormat";
import { Card, CardContent } from "@/components/ui/card";

export function MetricTile({
  icon: Icon,
  label,
  value,
  delta,
  invert,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: number;
  invert?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <DeltaBadge value={delta} invert={invert} />
        </div>
      </CardContent>
    </Card>
  );
}
