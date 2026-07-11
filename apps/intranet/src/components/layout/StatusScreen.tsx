import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

export interface StatusScreenProps {
  icon: LucideIcon;
  code: string;
  title: string;
  description: string;
  action?: ReactNode;
  /** Center in the full viewport (route-level screens with no app shell). */
  fullScreen?: boolean;
  className?: string;
}

/**
 * Presentational shell shared by full-page status screens (403, 404, …) so
 * each one only has to supply its copy, icon, and action — see
 * `ForbiddenScreen` / `NotFoundScreen`.
 */
export function StatusScreen({
  icon: Icon,
  code,
  title,
  description,
  action,
  fullScreen = false,
  className,
}: StatusScreenProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center p-6",
        fullScreen ? "min-h-screen" : "min-h-[60vh]",
        className
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Icon className="h-7 w-7" />
        </span>
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {code}
          </p>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
