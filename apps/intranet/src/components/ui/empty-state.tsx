import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * What a list shows when it has nothing to show: what this is, one line on
 * why it's empty, and — whenever the viewer can do something about it — the
 * button that does. The Anthropic Console pattern ("No API keys yet · Create
 * key"): an empty list is the moment someone is most likely to want the
 * create action, so it belongs here, not only in a header they've scrolled
 * past.
 *
 * A quiet hairline surface rather than a dashed border — dashed reads as
 * "drop a file here", which is a different promise.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-1.5 flex size-10 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-balance">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
