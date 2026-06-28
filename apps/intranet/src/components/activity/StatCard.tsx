import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Small KPI card used across the ActivityTrack dashboard. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {icon && (
            <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          )}
        </div>
        <p
          className={cn("mt-2 font-display text-2xl font-bold tracking-tight")}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
